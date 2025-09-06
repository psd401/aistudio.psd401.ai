"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = handler;
const client_rds_data_1 = require("@aws-sdk/client-rds-data");
const rdsClient = new client_rds_data_1.RDSDataClient({});
// Migration files that should ALWAYS run (additive only)
const MIGRATION_FILES = [
    '010-knowledge-repositories.sql',
    '11_textract_jobs.sql',
    '12_textract_usage.sql'
    // Future migrations go here
];
// Initial setup files (only run on empty database)
const INITIAL_SETUP_FILES = [
    '001-enums.sql',
    '002-tables.sql',
    '003-constraints.sql',
    '004-indexes.sql',
    '005-initial-data.sql'
];
async function handler(event) {
    console.log('Database initialization event:', JSON.stringify(event, null, 2));
    if (event.RequestType === 'Delete') {
        return {
            PhysicalResourceId: event.PhysicalResourceId || 'db-init',
            Status: 'SUCCESS',
            Reason: 'Delete not required for database initialization'
        };
    }
    const { ClusterArn, SecretArn, DatabaseName } = event.ResourceProperties;
    try {
        // Check if this is a fresh database or existing one
        const isDatabaseEmpty = await checkIfDatabaseEmpty(ClusterArn, SecretArn, DatabaseName);
        if (isDatabaseEmpty) {
            console.log('Empty database detected - running full initialization');
            // Run initial setup files
            for (const sqlFile of INITIAL_SETUP_FILES) {
                console.log(`Executing initial setup: ${sqlFile}`);
                await executeFileStatements(ClusterArn, SecretArn, DatabaseName, sqlFile);
            }
        }
        else {
            console.log('Existing database detected - skipping initial setup files');
        }
        // ALWAYS run migrations (they should be idempotent)
        console.log('Running migrations...');
        // Ensure migration tracking table exists
        await ensureMigrationTable(ClusterArn, SecretArn, DatabaseName);
        // Run each migration that hasn't been run yet
        for (const migrationFile of MIGRATION_FILES) {
            const hasRun = await checkMigrationRun(ClusterArn, SecretArn, DatabaseName, migrationFile);
            if (!hasRun) {
                console.log(`Running migration: ${migrationFile}`);
                const startTime = Date.now();
                try {
                    await executeFileStatements(ClusterArn, SecretArn, DatabaseName, migrationFile);
                    // Record successful migration
                    await recordMigration(ClusterArn, SecretArn, DatabaseName, migrationFile, true, Date.now() - startTime);
                    console.log(`Migration ${migrationFile} completed successfully`);
                }
                catch (error) {
                    // Record failed migration
                    await recordMigration(ClusterArn, SecretArn, DatabaseName, migrationFile, false, Date.now() - startTime, error.message);
                    throw new Error(`Migration ${migrationFile} failed: ${error.message}`);
                }
            }
            else {
                console.log(`Skipping migration ${migrationFile} - already run`);
            }
        }
        return {
            PhysicalResourceId: 'db-init',
            Status: 'SUCCESS',
            Reason: 'Database initialization/migration completed successfully'
        };
    }
    catch (error) {
        console.error('Database operation failed:', error);
        return {
            PhysicalResourceId: 'db-init',
            Status: 'FAILED',
            Reason: `Database operation failed: ${error}`
        };
    }
}
async function checkIfDatabaseEmpty(clusterArn, secretArn, database) {
    try {
        // Check if users table exists (core table that should always exist)
        const result = await executeSql(clusterArn, secretArn, database, `SELECT COUNT(*) FROM information_schema.tables 
       WHERE table_schema = 'public' 
       AND table_name = 'users'`);
        const count = result.records?.[0]?.[0]?.longValue || 0;
        return count === 0;
    }
    catch (error) {
        // If we can't check, assume empty
        return true;
    }
}
async function ensureMigrationTable(clusterArn, secretArn, database) {
    // This exactly matches the existing migration_log structure
    const sql = `
    CREATE TABLE IF NOT EXISTS migration_log (
      id SERIAL PRIMARY KEY,
      step_number INTEGER NOT NULL,
      description TEXT NOT NULL,
      sql_executed TEXT,
      status VARCHAR(20) DEFAULT 'pending',
      error_message TEXT,
      executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;
    await executeSql(clusterArn, secretArn, database, sql);
}
async function checkMigrationRun(clusterArn, secretArn, database, migrationFile) {
    try {
        const result = await executeSql(clusterArn, secretArn, database, `SELECT COUNT(*) FROM migration_log 
       WHERE description = '${migrationFile}' 
       AND status = 'completed'`);
        const count = result.records?.[0]?.[0]?.longValue || 0;
        return count > 0;
    }
    catch (error) {
        return false;
    }
}
async function recordMigration(clusterArn, secretArn, database, migrationFile, success, executionTime, errorMessage) {
    const maxStepResult = await executeSql(clusterArn, secretArn, database, `SELECT COALESCE(MAX(step_number), 0) + 1 as next_step FROM migration_log`);
    const nextStep = maxStepResult.records?.[0]?.[0]?.longValue || 1;
    const status = success ? 'completed' : 'failed';
    const errorPart = errorMessage ? `, error_message = '${errorMessage.replace(/'/g, "''")}'` : '';
    await executeSql(clusterArn, secretArn, database, `INSERT INTO migration_log (step_number, description, sql_executed, status${errorMessage ? ', error_message' : ''}) 
     VALUES (${nextStep}, '${migrationFile}', 'Migration file executed', '${status}'${errorMessage ? `, '${errorMessage.replace(/'/g, "''")}'` : ''})`);
}
async function executeFileStatements(clusterArn, secretArn, database, filename) {
    const sql = await getSqlContent(filename);
    const statements = splitSqlStatements(sql);
    for (const statement of statements) {
        if (statement.trim()) {
            await executeSql(clusterArn, secretArn, database, statement);
        }
    }
}
async function executeSql(clusterArn, secretArn, database, sql) {
    const command = new client_rds_data_1.ExecuteStatementCommand({
        resourceArn: clusterArn,
        secretArn: secretArn,
        database: database,
        sql: sql,
        includeResultMetadata: true
    });
    const response = await rdsClient.send(command);
    return response;
}
function splitSqlStatements(sql) {
    // Remove comments
    const withoutComments = sql
        .split('\n')
        .filter(line => !line.trim().startsWith('--'))
        .join('\n');
    // Split by semicolon but handle blocks
    const statements = [];
    let currentStatement = '';
    let inBlock = false;
    const lines = withoutComments.split('\n');
    for (const line of lines) {
        const trimmedLine = line.trim().toUpperCase();
        if (trimmedLine.startsWith('CREATE TYPE') ||
            trimmedLine.startsWith('CREATE FUNCTION') ||
            trimmedLine.startsWith('DROP TYPE')) {
            inBlock = true;
        }
        currentStatement += line + '\n';
        if (line.trim().endsWith(';')) {
            if (inBlock && (trimmedLine === ');' || trimmedLine.endsWith(');'))) {
                inBlock = false;
            }
            if (!inBlock) {
                statements.push(currentStatement.trim());
                currentStatement = '';
            }
        }
    }
    if (currentStatement.trim()) {
        statements.push(currentStatement.trim());
    }
    return statements;
}
async function getSqlContent(filename) {
    const fs = require('fs').promises;
    const path = require('path');
    try {
        const schemaPath = path.join(__dirname, 'schema', filename);
        const content = await fs.readFile(schemaPath, 'utf8');
        return content;
    }
    catch (error) {
        console.error(`Failed to read SQL file ${filename}:`, error);
        throw new Error(`Could not load SQL file: ${filename}`);
    }
}
//# sourceMappingURL=db-init-handler-v2.js.map