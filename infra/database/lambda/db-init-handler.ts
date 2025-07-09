import { RDSDataClient, ExecuteStatementCommand } from '@aws-sdk/client-rds-data';
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';

const rdsClient = new RDSDataClient({});
const secretsClient = new SecretsManagerClient({});

interface CustomResourceEvent {
  RequestType: 'Create' | 'Update' | 'Delete';
  ResourceProperties: {
    ClusterArn: string;
    SecretArn: string;
    DatabaseName: string;
    Environment: string;
  };
  PhysicalResourceId?: string;
}

// SQL files in order of execution
const SQL_FILES = [
  '001-enums.sql',
  '002-tables.sql',
  '003-constraints.sql',
  '004-indexes.sql',
  '005-initial-data.sql'
];

export async function handler(event: CustomResourceEvent): Promise<any> {
  console.log('Database initialization event:', JSON.stringify(event, null, 2));

  // Only run on Create or Update
  if (event.RequestType === 'Delete') {
    return {
      PhysicalResourceId: event.PhysicalResourceId || 'db-init',
      Status: 'SUCCESS',
      Reason: 'Delete not required for database initialization'
    };
  }

  const { ClusterArn, SecretArn, DatabaseName, Environment } = event.ResourceProperties;

  try {
    // First, check if the database has already been initialized
    const isInitialized = await checkIfInitialized(ClusterArn, SecretArn, DatabaseName);
    
    if (isInitialized) {
      console.log('Database already initialized, skipping initialization');
      return {
        PhysicalResourceId: 'db-init',
        Status: 'SUCCESS',
        Reason: 'Database already initialized'
      };
    }

    console.log('Starting database initialization...');
    
    // Execute each SQL file in order
    for (const sqlFile of SQL_FILES) {
      console.log(`Executing ${sqlFile}...`);
      const sql = await getSqlContent(sqlFile);
      
      // Split SQL into individual statements (handling multi-line statements)
      const statements = splitSqlStatements(sql);
      
      for (const statement of statements) {
        if (statement.trim()) {
          try {
            await executeSql(ClusterArn, SecretArn, DatabaseName, statement);
          } catch (error: any) {
            // Log error but continue if it's a "already exists" type error
            if (error.message?.includes('already exists') || 
                error.message?.includes('duplicate key')) {
              console.log(`Skipping (already exists): ${error.message}`);
            } else {
              throw error;
            }
          }
        }
      }
      
      console.log(`Completed ${sqlFile}`);
    }

    // Mark database as initialized
    await markAsInitialized(ClusterArn, SecretArn, DatabaseName);

    return {
      PhysicalResourceId: 'db-init',
      Status: 'SUCCESS',
      Reason: 'Database initialized successfully'
    };

  } catch (error) {
    console.error('Database initialization failed:', error);
    return {
      PhysicalResourceId: 'db-init',
      Status: 'FAILED',
      Reason: `Database initialization failed: ${error}`
    };
  }
}

async function checkIfInitialized(
  clusterArn: string,
  secretArn: string,
  database: string
): Promise<boolean> {
  try {
    // Check if the migration_log table exists and has the init record
    const result = await executeSql(
      clusterArn,
      secretArn,
      database,
      `SELECT COUNT(*) as count FROM migration_log WHERE migration_name = 'initial-schema'`
    );
    
    return result.records && result.records.length > 0 && 
           result.records[0][0].longValue > 0;
  } catch (error: any) {
    // If the table doesn't exist, database is not initialized
    if (error.message?.includes('does not exist')) {
      return false;
    }
    throw error;
  }
}

async function markAsInitialized(
  clusterArn: string,
  secretArn: string,
  database: string
): Promise<void> {
  await executeSql(
    clusterArn,
    secretArn,
    database,
    `INSERT INTO migration_log (migration_name, execution_time_ms, success) 
     VALUES ('initial-schema', 0, true)`
  );
}

async function executeSql(
  clusterArn: string,
  secretArn: string,
  database: string,
  sql: string
): Promise<any> {
  const command = new ExecuteStatementCommand({
    resourceArn: clusterArn,
    secretArn: secretArn,
    database: database,
    sql: sql,
    includeResultMetadata: true
  });

  const response = await rdsClient.send(command);
  return response;
}

function splitSqlStatements(sql: string): string[] {
  // Remove comments
  const withoutComments = sql
    .split('\n')
    .filter(line => !line.trim().startsWith('--'))
    .join('\n');

  // Split by semicolon but handle CREATE TYPE/FUNCTION blocks specially
  const statements: string[] = [];
  let currentStatement = '';
  let inBlock = false;
  
  const lines = withoutComments.split('\n');
  
  for (const line of lines) {
    const trimmedLine = line.trim().toUpperCase();
    
    // Check if we're entering a block (CREATE TYPE, CREATE FUNCTION, etc.)
    if (trimmedLine.startsWith('CREATE TYPE') || 
        trimmedLine.startsWith('CREATE FUNCTION') ||
        trimmedLine.startsWith('DROP TYPE')) {
      inBlock = true;
    }
    
    currentStatement += line + '\n';
    
    // Check if this line ends with a semicolon
    if (line.trim().endsWith(';')) {
      // If we're in a block, check if this is the end
      if (inBlock && (trimmedLine === ');' || trimmedLine.endsWith(');'))) {
        inBlock = false;
      }
      
      // If not in a block, this statement is complete
      if (!inBlock) {
        statements.push(currentStatement.trim());
        currentStatement = '';
      }
    }
  }
  
  // Add any remaining statement
  if (currentStatement.trim()) {
    statements.push(currentStatement.trim());
  }
  
  return statements;
}

// In a real implementation, these would be loaded from S3 or bundled with the Lambda
async function getSqlContent(filename: string): Promise<string> {
  // This is a placeholder - in the actual implementation, you would either:
  // 1. Bundle the SQL files with the Lambda deployment package
  // 2. Store them in S3 and fetch them here
  // 3. Include them as string constants
  
  // For now, we'll include them as constants
  const sqlContent: { [key: string]: string } = {
    '001-enums.sql': `-- 001-enums.sql: Create all enum types used in the database
-- Drop existing types if they exist (for idempotency)
DROP TYPE IF EXISTS tool_status CASCADE;
DROP TYPE IF EXISTS job_status CASCADE;
DROP TYPE IF EXISTS execution_status CASCADE;
DROP TYPE IF EXISTS field_type CASCADE;
DROP TYPE IF EXISTS navigation_type CASCADE;

-- Tool status enum for tracking tool lifecycle
CREATE TYPE tool_status AS ENUM (
    'draft',
    'pending_approval',
    'approved',
    'rejected',
    'disabled'
);

-- Job status enum for background job tracking
CREATE TYPE job_status AS ENUM (
    'pending',
    'running',
    'completed',
    'failed'
);

-- Execution status enum for tool execution tracking
CREATE TYPE execution_status AS ENUM (
    'pending',
    'running',
    'completed',
    'failed'
);

-- Field type enum for tool input fields
CREATE TYPE field_type AS ENUM (
    'short_text',
    'long_text',
    'select',
    'multi_select',
    'file_upload'
);

-- Navigation type enum for navigation items
CREATE TYPE navigation_type AS ENUM (
    'link',
    'section',
    'page'
);`,

    '002-tables.sql': `${await getTablesSQL()}`,
    '003-constraints.sql': `${await getConstraintsSQL()}`,
    '004-indexes.sql': `${await getIndexesSQL()}`,
    '005-initial-data.sql': `${await getInitialDataSQL()}`
  };

  return sqlContent[filename] || '';
}

// Helper functions to return the SQL content
async function getTablesSQL(): Promise<string> {
  // Return the content from 002-tables.sql
  return `-- Tables SQL content here (too long to include inline)`;
}

async function getConstraintsSQL(): Promise<string> {
  // Return the content from 003-constraints.sql
  return `-- Constraints SQL content here`;
}

async function getIndexesSQL(): Promise<string> {
  // Return the content from 004-indexes.sql
  return `-- Indexes SQL content here`;
}

async function getInitialDataSQL(): Promise<string> {
  // Return the content from 005-initial-data.sql
  return `-- Initial data SQL content here`;
}