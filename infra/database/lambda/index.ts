import { RDSDataClient, ExecuteStatementCommand } from '@aws-sdk/client-rds-data';
import * as fs from 'fs';
import * as path from 'path';

const rdsClient = new RDSDataClient({});

interface CustomResourceEvent {
  RequestType: 'Create' | 'Update' | 'Delete';
  ResourceProperties: {
    ClusterArn: string;
    SecretArn: string;
    DatabaseName: string;
    Environment: string;
  };
  PhysicalResourceId?: string;
  RequestId: string;
  StackId: string;
  LogicalResourceId: string;
  ResponseURL: string;
}

// SQL files in order of execution
const SQL_FILES = [
  '001-enums.sql',
  '002-tables.sql', 
  '003-constraints.sql',
  '004-indexes.sql',
  '005-initial-data.sql'
];

export async function handler(event: CustomResourceEvent): Promise<void> {
  console.log('Database initialization event:', JSON.stringify(event, null, 2));

  let responseData = {};
  let physicalResourceId = event.PhysicalResourceId || 'db-init-' + event.RequestId;
  let status = 'SUCCESS';
  let reason = '';

  try {
    // Only run on Create or Update
    if (event.RequestType === 'Delete') {
      reason = 'Delete not required for database initialization';
    } else {
      const { ClusterArn, SecretArn, DatabaseName, Environment } = event.ResourceProperties;

      // Check if the database has already been initialized
      const isInitialized = await checkIfInitialized(ClusterArn, SecretArn, DatabaseName);
      
      if (isInitialized) {
        console.log('Database already initialized, skipping initialization');
        reason = 'Database already initialized';
      } else {
        console.log('Starting database initialization...');
        
        // Execute each SQL file in order
        for (const sqlFile of SQL_FILES) {
          console.log(`Executing ${sqlFile}...`);
          const sqlPath = path.join(__dirname, 'schema', sqlFile);
          const sql = fs.readFileSync(sqlPath, 'utf8');
          
          // Split SQL into individual statements
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
        reason = 'Database initialized successfully';
        responseData = { initialized: true };
      }
    }
  } catch (error: any) {
    console.error('Database initialization failed:', error);
    status = 'FAILED';
    reason = `Database initialization failed: ${error.message || error}`;
  }

  // Send response back to CloudFormation
  await sendResponse(event, status, reason, physicalResourceId, responseData);
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
    if (error.message?.includes('relation "migration_log" does not exist')) {
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
  const startTime = Date.now();
  await executeSql(
    clusterArn,
    secretArn,
    database,
    `INSERT INTO migration_log (migration_name, execution_time_ms, success) 
     VALUES ('initial-schema', ${Date.now() - startTime}, true)`
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
  // Remove comments and empty lines
  const lines = sql.split('\n');
  const cleanedLines: string[] = [];
  let inMultiLineComment = false;
  
  for (const line of lines) {
    let cleanedLine = line;
    
    // Handle multi-line comments
    if (inMultiLineComment) {
      const endIndex = cleanedLine.indexOf('*/');
      if (endIndex !== -1) {
        inMultiLineComment = false;
        cleanedLine = cleanedLine.substring(endIndex + 2);
      } else {
        continue;
      }
    }
    
    const startIndex = cleanedLine.indexOf('/*');
    if (startIndex !== -1) {
      const endIndex = cleanedLine.indexOf('*/', startIndex);
      if (endIndex !== -1) {
        cleanedLine = cleanedLine.substring(0, startIndex) + cleanedLine.substring(endIndex + 2);
      } else {
        inMultiLineComment = true;
        cleanedLine = cleanedLine.substring(0, startIndex);
      }
    }
    
    // Remove single-line comments
    const commentIndex = cleanedLine.indexOf('--');
    if (commentIndex !== -1) {
      cleanedLine = cleanedLine.substring(0, commentIndex);
    }
    
    if (cleanedLine.trim()) {
      cleanedLines.push(cleanedLine);
    }
  }
  
  // Join lines and split by semicolon
  const fullSql = cleanedLines.join('\n');
  const statements = fullSql.split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0)
    .map(s => s + ';'); // Add semicolon back
  
  return statements;
}

async function sendResponse(
  event: CustomResourceEvent,
  status: string,
  reason: string,
  physicalResourceId: string,
  data: any
): Promise<void> {
  const responseBody = JSON.stringify({
    Status: status,
    Reason: reason,
    PhysicalResourceId: physicalResourceId,
    StackId: event.StackId,
    RequestId: event.RequestId,
    LogicalResourceId: event.LogicalResourceId,
    Data: data
  });

  console.log('Response:', responseBody);

  const response = await fetch(event.ResponseURL, {
    method: 'PUT',
    headers: {
      'Content-Type': '',
      'Content-Length': responseBody.length.toString()
    },
    body: responseBody
  });

  if (!response.ok) {
    throw new Error(`Failed to send response: ${response.statusText}`);
  }
}