"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = handler;
const client_rds_data_1 = require("@aws-sdk/client-rds-data");
const client_secrets_manager_1 = require("@aws-sdk/client-secrets-manager");
const rdsClient = new client_rds_data_1.RDSDataClient({});
const secretsClient = new client_secrets_manager_1.SecretsManagerClient({});
/**
 * CRITICAL: Database Initialization and Migration Handler
 *
 * This Lambda handles TWO distinct scenarios:
 * 1. Fresh Installation: Runs all initial setup files (001-005)
 * 2. Existing Database: ONLY runs migration files (010+)
 *
 * WARNING: The initial setup files (001-005) MUST exactly match the existing
 * database structure or they will cause data corruption!
 *
 * @see /docs/database-restoration/DATABASE-MIGRATIONS.md for full details
 */
// Migration files that should ALWAYS run (additive only)
// These files should ONLY create new objects, never modify existing ones
const MIGRATION_FILES = [
    '010-knowledge-repositories.sql',
    '11_textract_jobs.sql',
    '12_textract_usage.sql',
    '013-add-knowledge-repositories-tool.sql',
    '014-model-comparisons.sql',
    '015-add-model-compare-tool.sql',
    '016-assistant-architect-repositories.sql',
    '017-add-user-roles-updated-at.sql',
    '018-model-replacement-audit.sql',
    '019-fix-navigation-role-display.sql',
    '020-add-user-role-version.sql',
    '023-navigation-multi-roles.sql',
    '024-model-role-restrictions.sql',
    '026-add-model-compare-source.sql',
    '027-messages-model-tracking.sql',
    '028-nexus-schema.sql',
    '029-ai-models-nexus-enhancements.sql',
    '030-nexus-provider-metrics.sql',
    '031-nexus-messages.sql',
    '032-remove-nexus-provider-constraint.sql',
    '033-ai-streaming-jobs.sql',
    '034-assistant-architect-enabled-tools.sql',
    '035-schedule-management-schema.sql',
    '036-remove-legacy-chat-tables.sql',
    '037-assistant-architect-events.sql',
    '039-prompt-library-schema.sql'
    // ADD NEW MIGRATIONS HERE - they will run once and be tracked
];
// Initial setup files (only run on empty database)
// WARNING: These must EXACTLY match existing database structure!
const INITIAL_SETUP_FILES = [
    '001-enums.sql', // Creates enum types
    '002-tables.sql', // Creates all core tables
    '003-constraints.sql', // Adds foreign key constraints
    '004-indexes.sql', // Creates performance indexes
    '005-initial-data.sql' // Inserts required seed data
];
async function handler(event) {
    console.log('Database initialization event:', JSON.stringify(event, null, 2));
    console.log('Handler version: 2025-07-31-v8 - Added required icon field');
    // SAFETY CHECK: Log what mode we're in
    console.log(`🔍 Checking database state for safety...`);
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
        // CRITICAL: Check if this is a fresh database or existing one
        const isDatabaseEmpty = await checkIfDatabaseEmpty(ClusterArn, SecretArn, DatabaseName);
        if (isDatabaseEmpty) {
            console.log('🆕 Empty database detected - running full initialization');
            // Run initial setup files for fresh installation
            for (const sqlFile of INITIAL_SETUP_FILES) {
                console.log(`Executing initial setup: ${sqlFile}`);
                await executeFileStatements(ClusterArn, SecretArn, DatabaseName, sqlFile);
            }
        }
        else {
            console.log('✅ Existing database detected - skipping initial setup files');
            console.log('⚠️  ONLY migration files will be processed');
        }
        // ALWAYS run migrations (they should be idempotent and safe)
        console.log('🔄 Processing migrations...');
        // Ensure migration tracking table exists
        await ensureMigrationTable(ClusterArn, SecretArn, DatabaseName);
        // Run each migration that hasn't been run yet
        for (const migrationFile of MIGRATION_FILES) {
            const hasRun = await checkMigrationRun(ClusterArn, SecretArn, DatabaseName, migrationFile);
            if (!hasRun) {
                console.log(`▶️  Running migration: ${migrationFile}`);
                const startTime = Date.now();
                try {
                    await executeFileStatements(ClusterArn, SecretArn, DatabaseName, migrationFile);
                    // Record successful migration
                    await recordMigration(ClusterArn, SecretArn, DatabaseName, migrationFile, true, Date.now() - startTime);
                    console.log(`✅ Migration ${migrationFile} completed successfully`);
                }
                catch (error) {
                    // Record failed migration
                    await recordMigration(ClusterArn, SecretArn, DatabaseName, migrationFile, false, Date.now() - startTime, error.message);
                    throw new Error(`Migration ${migrationFile} failed: ${error.message}`);
                }
            }
            else {
                console.log(`⏭️  Skipping migration ${migrationFile} - already run`);
            }
        }
        return {
            PhysicalResourceId: 'db-init',
            Status: 'SUCCESS',
            Reason: 'Database initialization/migration completed successfully'
        };
    }
    catch (error) {
        console.error('❌ Database operation failed:', error);
        return {
            PhysicalResourceId: 'db-init',
            Status: 'FAILED',
            Reason: `Database operation failed: ${error}`
        };
    }
}
/**
 * Check if database is empty (fresh installation)
 * Returns true if no core tables exist, false if database has been initialized
 */
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
        // If we can't check, assume empty for safety
        console.log('Could not check if database is empty, assuming fresh install');
        return true;
    }
}
/**
 * Ensure migration tracking table exists
 * This table tracks which migrations have been run
 */
async function ensureMigrationTable(clusterArn, secretArn, database) {
    // This exactly matches the existing migration_log structure from June 2025 database
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
/**
 * Check if a specific migration has already been run
 */
async function checkMigrationRun(clusterArn, secretArn, database, migrationFile) {
    try {
        const result = await executeSql(clusterArn, secretArn, database, `SELECT COUNT(*) FROM migration_log 
       WHERE description = '${migrationFile}' 
       AND status = 'completed'`);
        const count = result.records?.[0]?.[0]?.longValue || 0;
        return count > 0;
    }
    catch (error) {
        // If we can't check, assume not run
        return false;
    }
}
/**
 * Record a migration execution (success or failure)
 */
async function recordMigration(clusterArn, secretArn, database, migrationFile, success, executionTime, errorMessage) {
    const maxStepResult = await executeSql(clusterArn, secretArn, database, `SELECT COALESCE(MAX(step_number), 0) + 1 as next_step FROM migration_log`);
    const nextStep = maxStepResult.records?.[0]?.[0]?.longValue || 1;
    const status = success ? 'completed' : 'failed';
    const errorPart = errorMessage ? `, error_message = '${errorMessage.replace(/'/g, "''")}'` : '';
    await executeSql(clusterArn, secretArn, database, `INSERT INTO migration_log (step_number, description, sql_executed, status${errorMessage ? ', error_message' : ''}) 
     VALUES (${nextStep}, '${migrationFile}', 'Migration file executed', '${status}'${errorMessage ? `, '${errorMessage.replace(/'/g, "''")}'` : ''})`);
}
/**
 * Execute all statements in a SQL file
 */
async function executeFileStatements(clusterArn, secretArn, database, filename) {
    const sql = await getSqlContent(filename);
    const statements = splitSqlStatements(sql);
    for (const statement of statements) {
        if (statement.trim()) {
            try {
                await executeSql(clusterArn, secretArn, database, statement);
            }
            catch (error) {
                // For initial setup files, we might want to continue on "already exists" errors
                // For migrations, we should fail fast
                if (INITIAL_SETUP_FILES.includes(filename) &&
                    (error.message?.includes('already exists') ||
                        error.message?.includes('duplicate key'))) {
                    console.log(`⚠️  Skipping (already exists): ${error.message}`);
                }
                else if (MIGRATION_FILES.includes(filename)) {
                    // For migration files, check if it's an ALTER TABLE that actually succeeded
                    // RDS Data API sometimes returns an error-like response for successful ALTER TABLEs
                    const isAlterTable = statement.trim().toUpperCase().startsWith('ALTER TABLE');
                    if (isAlterTable) {
                        // Verify if the ALTER actually succeeded by checking the table structure
                        console.log(`⚠️  ALTER TABLE may have succeeded despite error response. Verifying...`);
                        // Extract table name and column from ALTER statement
                        const alterMatch = statement.match(/ALTER\s+TABLE\s+(\w+)\s+ADD\s+COLUMN\s+(IF\s+NOT\s+EXISTS\s+)?(\w+)/i);
                        if (alterMatch) {
                            const tableName = alterMatch[1];
                            const columnName = alterMatch[3];
                            try {
                                // Check if the column exists
                                const checkResult = await executeSql(clusterArn, secretArn, database, `SELECT column_name FROM information_schema.columns 
                   WHERE table_schema = 'public' 
                   AND table_name = '${tableName}' 
                   AND column_name = '${columnName}'`);
                                if (checkResult.records && checkResult.records.length > 0) {
                                    console.log(`✅ Column ${columnName} exists in table ${tableName} - ALTER succeeded`);
                                    // Column exists, so the ALTER worked - continue
                                    continue;
                                }
                            }
                            catch (checkError) {
                                console.log(`Could not verify column existence: ${checkError}`);
                            }
                        }
                    }
                    // If we couldn't verify success, throw the original error
                    throw error;
                }
                else {
                    throw error;
                }
            }
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
    try {
        const response = await rdsClient.send(command);
        return response;
    }
    catch (error) {
        // Log the full error for debugging
        console.error(`SQL execution error for statement: ${sql.substring(0, 100)}...`);
        console.error(`Error details:`, JSON.stringify(error, null, 2));
        // Check if this is a false-positive error for ALTER TABLE
        // RDS Data API sometimes returns errors for successful DDL operations
        if (sql.trim().toUpperCase().startsWith('ALTER TABLE') &&
            error.message &&
            (error.message.includes('Database returned SQL exception') ||
                error.message.includes('BadRequestException'))) {
            console.log(`⚠️  Potential false-positive error for ALTER TABLE - will verify in caller`);
        }
        throw error;
    }
}
function splitSqlStatements(sql) {
    // Remove comments
    const withoutComments = sql
        .split('\n')
        .filter(line => !line.trim().startsWith('--'))
        .join('\n');
    // Split by semicolon but handle CREATE TYPE/FUNCTION blocks specially
    const statements = [];
    let currentStatement = '';
    let inBlock = false;
    const lines = withoutComments.split('\n');
    for (const line of lines) {
        const trimmedLine = line.trim().toUpperCase();
        // Check if we're entering a block (CREATE TYPE, CREATE FUNCTION, etc.)
        if (trimmedLine.startsWith('CREATE TYPE') ||
            trimmedLine.startsWith('CREATE FUNCTION') ||
            trimmedLine.startsWith('CREATE OR REPLACE FUNCTION') ||
            trimmedLine.startsWith('DROP TYPE')) {
            inBlock = true;
        }
        currentStatement += line + '\n';
        // Check if this line ends with a semicolon
        if (line.trim().endsWith(';')) {
            // If we're in a block, check if this is the end
            if (inBlock && (trimmedLine === ');' || trimmedLine.endsWith(');') || trimmedLine.endsWith("' LANGUAGE PLPGSQL;"))) {
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
// Load SQL content from bundled schema files
async function getSqlContent(filename) {
    const fs = require('fs').promises;
    const path = require('path');
    try {
        // Schema files are copied to the Lambda deployment package
        const schemaPath = path.join(__dirname, 'schema', filename);
        const content = await fs.readFile(schemaPath, 'utf8');
        return content;
    }
    catch (error) {
        console.error(`Failed to read SQL file ${filename}:`, error);
        throw new Error(`Could not load SQL file: ${filename}`);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGItaW5pdC1oYW5kbGVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiZGItaW5pdC1oYW5kbGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBd0VBLDBCQWdGQztBQXhKRCw4REFBa0Y7QUFDbEYsNEVBQThGO0FBRTlGLE1BQU0sU0FBUyxHQUFHLElBQUksK0JBQWEsQ0FBQyxFQUFFLENBQUMsQ0FBQztBQUN4QyxNQUFNLGFBQWEsR0FBRyxJQUFJLDZDQUFvQixDQUFDLEVBQUUsQ0FBQyxDQUFDO0FBYW5EOzs7Ozs7Ozs7OztHQVdHO0FBRUgseURBQXlEO0FBQ3pELHlFQUF5RTtBQUN6RSxNQUFNLGVBQWUsR0FBRztJQUN0QixnQ0FBZ0M7SUFDaEMsc0JBQXNCO0lBQ3RCLHVCQUF1QjtJQUN2Qix5Q0FBeUM7SUFDekMsMkJBQTJCO0lBQzNCLGdDQUFnQztJQUNoQywwQ0FBMEM7SUFDMUMsbUNBQW1DO0lBQ25DLGlDQUFpQztJQUNqQyxxQ0FBcUM7SUFDckMsK0JBQStCO0lBQy9CLGdDQUFnQztJQUNoQyxpQ0FBaUM7SUFDakMsa0NBQWtDO0lBQ2xDLGlDQUFpQztJQUNqQyxzQkFBc0I7SUFDdEIsc0NBQXNDO0lBQ3RDLGdDQUFnQztJQUNoQyx3QkFBd0I7SUFDeEIsMENBQTBDO0lBQzFDLDJCQUEyQjtJQUMzQiwyQ0FBMkM7SUFDM0Msb0NBQW9DO0lBQ3BDLG1DQUFtQztJQUNuQyxvQ0FBb0M7SUFDcEMsK0JBQStCO0lBQy9CLDhEQUE4RDtDQUMvRCxDQUFDO0FBRUYsbURBQW1EO0FBQ25ELGlFQUFpRTtBQUNqRSxNQUFNLG1CQUFtQixHQUFHO0lBQzFCLGVBQWUsRUFBTyxxQkFBcUI7SUFDM0MsZ0JBQWdCLEVBQU0sMEJBQTBCO0lBQ2hELHFCQUFxQixFQUFFLCtCQUErQjtJQUN0RCxpQkFBaUIsRUFBTSw4QkFBOEI7SUFDckQsc0JBQXNCLENBQUMsNkJBQTZCO0NBQ3JELENBQUM7QUFFSyxLQUFLLFVBQVUsT0FBTyxDQUFDLEtBQTBC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QUksQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLFFBQVEsRUFBRSxRQUFRLENBQUMsQ0FBQztRQUM1RCxNQUFNLE9BQU8sR0FBRyxNQUFNLEVBQUUsQ0FBQyxRQUFRLENBQUMsVUFBVSxFQUFFLE1BQU0sQ0FBQyxDQUFDO1FBQ3RELE9BQU8sT0FBTyxDQUFDO0lBQ2pCLENBQUM7SUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1FBQ2YsT0FBTyxDQUFDLEtBQUssQ0FBQywyQkFBMkIsUUFBUSxHQUFHLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDN0QsTUFBTSxJQUFJLEtBQUssQ0FBQyw0QkFBNEIsUUFBUSxFQUFFLENBQUMsQ0FBQztJQUMxRCxDQUFDO0FBQ0gsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IFJEU0RhdGFDbGllbnQsIEV4ZWN1dGVTdGF0ZW1lbnRDb21tYW5kIH0gZnJvbSAnQGF3cy1zZGsvY2xpZW50LXJkcy1kYXRhJztcbmltcG9ydCB7IEdldFNlY3JldFZhbHVlQ29tbWFuZCwgU2VjcmV0c01hbmFnZXJDbGllbnQgfSBmcm9tICdAYXdzLXNkay9jbGllbnQtc2VjcmV0cy1tYW5hZ2VyJztcblxuY29uc3QgcmRzQ2xpZW50ID0gbmV3IFJEU0RhdGFDbGllbnQoe30pO1xuY29uc3Qgc2VjcmV0c0NsaWVudCA9IG5ldyBTZWNyZXRzTWFuYWdlckNsaWVudCh7fSk7XG5cbmludGVyZmFjZSBDdXN0b21SZXNvdXJjZUV2ZW50IHtcbiAgUmVxdWVzdFR5cGU6ICdDcmVhdGUnIHwgJ1VwZGF0ZScgfCAnRGVsZXRlJztcbiAgUmVzb3VyY2VQcm9wZXJ0aWVzOiB7XG4gICAgQ2x1c3RlckFybjogc3RyaW5nO1xuICAgIFNlY3JldEFybjogc3RyaW5nO1xuICAgIERhdGFiYXNlTmFtZTogc3RyaW5nO1xuICAgIEVudmlyb25tZW50OiBzdHJpbmc7XG4gIH07XG4gIFBoeXNpY2FsUmVzb3VyY2VJZD86IHN0cmluZztcbn1cblxuLyoqXG4gKiBDUklUSUNBTDogRGF0YWJhc2UgSW5pdGlhbGl6YXRpb24gYW5kIE1pZ3JhdGlvbiBIYW5kbGVyXG4gKiBcbiAqIFRoaXMgTGFtYmRhIGhhbmRsZXMgVFdPIGRpc3RpbmN0IHNjZW5hcmlvczpcbiAqIDEuIEZyZXNoIEluc3RhbGxhdGlvbjogUnVucyBhbGwgaW5pdGlhbCBzZXR1cCBmaWxlcyAoMDAxLTAwNSlcbiAqIDIuIEV4aXN0aW5nIERhdGFiYXNlOiBPTkxZIHJ1bnMgbWlncmF0aW9uIGZpbGVzICgwMTArKVxuICogXG4gKiBXQVJOSU5HOiBUaGUgaW5pdGlhbCBzZXR1cCBmaWxlcyAoMDAxLTAwNSkgTVVTVCBleGFjdGx5IG1hdGNoIHRoZSBleGlzdGluZ1xuICogZGF0YWJhc2Ugc3RydWN0dXJlIG9yIHRoZXkgd2lsbCBjYXVzZSBkYXRhIGNvcnJ1cHRpb24hXG4gKiBcbiAqIEBzZWUgL2RvY3MvZGF0YWJhc2UtcmVzdG9yYXRpb24vREFUQUJBU0UtTUlHUkFUSU9OUy5tZCBmb3IgZnVsbCBkZXRhaWxzXG4gKi9cblxuLy8gTWlncmF0aW9uIGZpbGVzIHRoYXQgc2hvdWxkIEFMV0FZUyBydW4gKGFkZGl0aXZlIG9ubHkpXG4vLyBUaGVzZSBmaWxlcyBzaG91bGQgT05MWSBjcmVhdGUgbmV3IG9iamVjdHMsIG5ldmVyIG1vZGlmeSBleGlzdGluZyBvbmVzXG5jb25zdCBNSUdSQVRJT05fRklMRVMgPSBbXG4gICcwMTAta25vd2xlZGdlLXJlcG9zaXRvcmllcy5zcWwnLFxuICAnMTFfdGV4dHJhY3Rfam9icy5zcWwnLFxuICAnMTJfdGV4dHJhY3RfdXNhZ2Uuc3FsJyxcbiAgJzAxMy1hZGQta25vd2xlZGdlLXJlcG9zaXRvcmllcy10b29sLnNxbCcsXG4gICcwMTQtbW9kZWwtY29tcGFyaXNvbnMuc3FsJyxcbiAgJzAxNS1hZGQtbW9kZWwtY29tcGFyZS10b29sLnNxbCcsXG4gICcwMTYtYXNzaXN0YW50LWFyY2hpdGVjdC1yZXBvc2l0b3JpZXMuc3FsJyxcbiAgJzAxNy1hZGQtdXNlci1yb2xlcy11cGRhdGVkLWF0LnNxbCcsXG4gICcwMTgtbW9kZWwtcmVwbGFjZW1lbnQtYXVkaXQuc3FsJyxcbiAgJzAxOS1maXgtbmF2aWdhdGlvbi1yb2xlLWRpc3BsYXkuc3FsJyxcbiAgJzAyMC1hZGQtdXNlci1yb2xlLXZlcnNpb24uc3FsJyxcbiAgJzAyMy1uYXZpZ2F0aW9uLW11bHRpLXJvbGVzLnNxbCcsXG4gICcwMjQtbW9kZWwtcm9sZS1yZXN0cmljdGlvbnMuc3FsJyxcbiAgJzAyNi1hZGQtbW9kZWwtY29tcGFyZS1zb3VyY2Uuc3FsJyxcbiAgJzAyNy1tZXNzYWdlcy1tb2RlbC10cmFja2luZy5zcWwnLFxuICAnMDI4LW5leHVzLXNjaGVtYS5zcWwnLFxuICAnMDI5LWFpLW1vZGVscy1uZXh1cy1lbmhhbmNlbWVudHMuc3FsJyxcbiAgJzAzMC1uZXh1cy1wcm92aWRlci1tZXRyaWNzLnNxbCcsXG4gICcwMzEtbmV4dXMtbWVzc2FnZXMuc3FsJyxcbiAgJzAzMi1yZW1vdmUtbmV4dXMtcHJvdmlkZXItY29uc3RyYWludC5zcWwnLFxuICAnMDMzLWFpLXN0cmVhbWluZy1qb2JzLnNxbCcsXG4gICcwMzQtYXNzaXN0YW50LWFyY2hpdGVjdC1lbmFibGVkLXRvb2xzLnNxbCcsXG4gICcwMzUtc2NoZWR1bGUtbWFuYWdlbWVudC1zY2hlbWEuc3FsJyxcbiAgJzAzNi1yZW1vdmUtbGVnYWN5LWNoYXQtdGFibGVzLnNxbCcsXG4gICcwMzctYXNzaXN0YW50LWFyY2hpdGVjdC1ldmVudHMuc3FsJyxcbiAgJzAzOS1wcm9tcHQtbGlicmFyeS1zY2hlbWEuc3FsJ1xuICAvLyBBREQgTkVXIE1JR1JBVElPTlMgSEVSRSAtIHRoZXkgd2lsbCBydW4gb25jZSBhbmQgYmUgdHJhY2tlZFxuXTtcblxuLy8gSW5pdGlhbCBzZXR1cCBmaWxlcyAob25seSBydW4gb24gZW1wdHkgZGF0YWJhc2UpXG4vLyBXQVJOSU5HOiBUaGVzZSBtdXN0IEVYQUNUTFkgbWF0Y2ggZXhpc3RpbmcgZGF0YWJhc2Ugc3RydWN0dXJlIVxuY29uc3QgSU5JVElBTF9TRVRVUF9GSUxFUyA9IFtcbiAgJzAwMS1lbnVtcy5zcWwnLCAgICAgIC8vIENyZWF0ZXMgZW51bSB0eXBlc1xuICAnMDAyLXRhYmxlcy5zcWwnLCAgICAgLy8gQ3JlYXRlcyBhbGwgY29yZSB0YWJsZXNcbiAgJzAwMy1jb25zdHJhaW50cy5zcWwnLCAvLyBBZGRzIGZvcmVpZ24ga2V5IGNvbnN0cmFpbnRzXG4gICcwMDQtaW5kZXhlcy5zcWwnLCAgICAgLy8gQ3JlYXRlcyBwZXJmb3JtYW5jZSBpbmRleGVzXG4gICcwMDUtaW5pdGlhbC1kYXRhLnNxbCcgLy8gSW5zZXJ0cyByZXF1aXJlZCBzZWVkIGRhdGFcbl07XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBoYW5kbGVyKGV2ZW50OiBDdXN0b21SZXNvdXJjZUV2ZW50KTogUHJvbWlzZTxhbnk+IHtcbiAgY29uc29sZS5sb2coJ0RhdGFiYXNlIGluaXRpYWxpemF0aW9uIGV2ZW50OicsIEpTT04uc3RyaW5naWZ5KGV2ZW50LCBudWxsLCAyKSk7XG4gIGNvbnNvbGUubG9nKCdIYW5kbGVyIHZlcnNpb246IDIwMjUtMDctMzEtdjggLSBBZGRlZCByZXF1aXJlZCBpY29uIGZpZWxkJyk7XG4gIFxuICAvLyBTQUZFVFkgQ0hFQ0s6IExvZyB3aGF0IG1vZGUgd2UncmUgaW5cbiAgY29uc29sZS5sb2coYPCflI0gQ2hlY2tpbmcgZGF0YWJhc2Ugc3RhdGUgZm9yIHNhZmV0eS4uLmApO1xuXG4gIC8vIE9ubHkgcnVuIG9uIENyZWF0ZSBvciBVcGRhdGVcbiAgaWYgKGV2ZW50LlJlcXVlc3RUeXBlID09PSAnRGVsZXRlJykge1xuICAgIHJldHVybiB7XG4gICAgICBQaHlzaWNhbFJlc291cmNlSWQ6IGV2ZW50LlBoeXNpY2FsUmVzb3VyY2VJZCB8fCAnZGItaW5pdCcsXG4gICAgICBTdGF0dXM6ICdTVUNDRVNTJyxcbiAgICAgIFJlYXNvbjogJ0RlbGV0ZSBub3QgcmVxdWlyZWQgZm9yIGRhdGFiYXNlIGluaXRpYWxpemF0aW9uJ1xuICAgIH07XG4gIH1cblxuICBjb25zdCB7IENsdXN0ZXJBcm4sIFNlY3JldEFybiwgRGF0YWJhc2VOYW1lLCBFbnZpcm9ubWVudCB9ID0gZXZlbnQuUmVzb3VyY2VQcm9wZXJ0aWVzO1xuXG4gIHRyeSB7XG4gICAgLy8gQ1JJVElDQUw6IENoZWNrIGlmIHRoaXMgaXMgYSBmcmVzaCBkYXRhYmFzZSBvciBleGlzdGluZyBvbmVcbiAgICBjb25zdCBpc0RhdGFiYXNlRW1wdHkgPSBhd2FpdCBjaGVja0lmRGF0YWJhc2VFbXB0eShDbHVzdGVyQXJuLCBTZWNyZXRBcm4sIERhdGFiYXNlTmFtZSk7XG4gICAgXG4gICAgaWYgKGlzRGF0YWJhc2VFbXB0eSkge1xuICAgICAgY29uc29sZS5sb2coJ/CfhpUgRW1wdHkgZGF0YWJhc2UgZGV0ZWN0ZWQgLSBydW5uaW5nIGZ1bGwgaW5pdGlhbGl6YXRpb24nKTtcbiAgICAgIFxuICAgICAgLy8gUnVuIGluaXRpYWwgc2V0dXAgZmlsZXMgZm9yIGZyZXNoIGluc3RhbGxhdGlvblxuICAgICAgZm9yIChjb25zdCBzcWxGaWxlIG9mIElOSVRJQUxfU0VUVVBfRklMRVMpIHtcbiAgICAgICAgY29uc29sZS5sb2coYEV4ZWN1dGluZyBpbml0aWFsIHNldHVwOiAke3NxbEZpbGV9YCk7XG4gICAgICAgIGF3YWl0IGV4ZWN1dGVGaWxlU3RhdGVtZW50cyhDbHVzdGVyQXJuLCBTZWNyZXRBcm4sIERhdGFiYXNlTmFtZSwgc3FsRmlsZSk7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnNvbGUubG9nKCfinIUgRXhpc3RpbmcgZGF0YWJhc2UgZGV0ZWN0ZWQgLSBza2lwcGluZyBpbml0aWFsIHNldHVwIGZpbGVzJyk7XG4gICAgICBjb25zb2xlLmxvZygn4pqg77iPICBPTkxZIG1pZ3JhdGlvbiBmaWxlcyB3aWxsIGJlIHByb2Nlc3NlZCcpO1xuICAgIH1cblxuICAgIC8vIEFMV0FZUyBydW4gbWlncmF0aW9ucyAodGhleSBzaG91bGQgYmUgaWRlbXBvdGVudCBhbmQgc2FmZSlcbiAgICBjb25zb2xlLmxvZygn8J+UhCBQcm9jZXNzaW5nIG1pZ3JhdGlvbnMuLi4nKTtcbiAgICBcbiAgICAvLyBFbnN1cmUgbWlncmF0aW9uIHRyYWNraW5nIHRhYmxlIGV4aXN0c1xuICAgIGF3YWl0IGVuc3VyZU1pZ3JhdGlvblRhYmxlKENsdXN0ZXJBcm4sIFNlY3JldEFybiwgRGF0YWJhc2VOYW1lKTtcbiAgICBcbiAgICAvLyBSdW4gZWFjaCBtaWdyYXRpb24gdGhhdCBoYXNuJ3QgYmVlbiBydW4geWV0XG4gICAgZm9yIChjb25zdCBtaWdyYXRpb25GaWxlIG9mIE1JR1JBVElPTl9GSUxFUykge1xuICAgICAgY29uc3QgaGFzUnVuID0gYXdhaXQgY2hlY2tNaWdyYXRpb25SdW4oQ2x1c3RlckFybiwgU2VjcmV0QXJuLCBEYXRhYmFzZU5hbWUsIG1pZ3JhdGlvbkZpbGUpO1xuICAgICAgXG4gICAgICBpZiAoIWhhc1J1bikge1xuICAgICAgICBjb25zb2xlLmxvZyhg4pa277iPICBSdW5uaW5nIG1pZ3JhdGlvbjogJHttaWdyYXRpb25GaWxlfWApO1xuICAgICAgICBjb25zdCBzdGFydFRpbWUgPSBEYXRlLm5vdygpO1xuICAgICAgICBcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBhd2FpdCBleGVjdXRlRmlsZVN0YXRlbWVudHMoQ2x1c3RlckFybiwgU2VjcmV0QXJuLCBEYXRhYmFzZU5hbWUsIG1pZ3JhdGlvbkZpbGUpO1xuICAgICAgICAgIFxuICAgICAgICAgIC8vIFJlY29yZCBzdWNjZXNzZnVsIG1pZ3JhdGlvblxuICAgICAgICAgIGF3YWl0IHJlY29yZE1pZ3JhdGlvbihDbHVzdGVyQXJuLCBTZWNyZXRBcm4sIERhdGFiYXNlTmFtZSwgbWlncmF0aW9uRmlsZSwgdHJ1ZSwgRGF0ZS5ub3coKSAtIHN0YXJ0VGltZSk7XG4gICAgICAgICAgY29uc29sZS5sb2coYOKchSBNaWdyYXRpb24gJHttaWdyYXRpb25GaWxlfSBjb21wbGV0ZWQgc3VjY2Vzc2Z1bGx5YCk7XG4gICAgICAgICAgXG4gICAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgICAvLyBSZWNvcmQgZmFpbGVkIG1pZ3JhdGlvblxuICAgICAgICAgIGF3YWl0IHJlY29yZE1pZ3JhdGlvbihDbHVzdGVyQXJuLCBTZWNyZXRBcm4sIERhdGFiYXNlTmFtZSwgbWlncmF0aW9uRmlsZSwgZmFsc2UsIERhdGUubm93KCkgLSBzdGFydFRpbWUsIGVycm9yLm1lc3NhZ2UpO1xuICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgTWlncmF0aW9uICR7bWlncmF0aW9uRmlsZX0gZmFpbGVkOiAke2Vycm9yLm1lc3NhZ2V9YCk7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbnNvbGUubG9nKGDij63vuI8gIFNraXBwaW5nIG1pZ3JhdGlvbiAke21pZ3JhdGlvbkZpbGV9IC0gYWxyZWFkeSBydW5gKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgUGh5c2ljYWxSZXNvdXJjZUlkOiAnZGItaW5pdCcsXG4gICAgICBTdGF0dXM6ICdTVUNDRVNTJyxcbiAgICAgIFJlYXNvbjogJ0RhdGFiYXNlIGluaXRpYWxpemF0aW9uL21pZ3JhdGlvbiBjb21wbGV0ZWQgc3VjY2Vzc2Z1bGx5J1xuICAgIH07XG5cbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCfinYwgRGF0YWJhc2Ugb3BlcmF0aW9uIGZhaWxlZDonLCBlcnJvcik7XG4gICAgcmV0dXJuIHtcbiAgICAgIFBoeXNpY2FsUmVzb3VyY2VJZDogJ2RiLWluaXQnLFxuICAgICAgU3RhdHVzOiAnRkFJTEVEJyxcbiAgICAgIFJlYXNvbjogYERhdGFiYXNlIG9wZXJhdGlvbiBmYWlsZWQ6ICR7ZXJyb3J9YFxuICAgIH07XG4gIH1cbn1cblxuLyoqXG4gKiBDaGVjayBpZiBkYXRhYmFzZSBpcyBlbXB0eSAoZnJlc2ggaW5zdGFsbGF0aW9uKVxuICogUmV0dXJucyB0cnVlIGlmIG5vIGNvcmUgdGFibGVzIGV4aXN0LCBmYWxzZSBpZiBkYXRhYmFzZSBoYXMgYmVlbiBpbml0aWFsaXplZFxuICovXG5hc3luYyBmdW5jdGlvbiBjaGVja0lmRGF0YWJhc2VFbXB0eShcbiAgY2x1c3RlckFybjogc3RyaW5nLFxuICBzZWNyZXRBcm46IHN0cmluZyxcbiAgZGF0YWJhc2U6IHN0cmluZ1xuKTogUHJvbWlzZTxib29sZWFuPiB7XG4gIHRyeSB7XG4gICAgLy8gQ2hlY2sgaWYgdXNlcnMgdGFibGUgZXhpc3RzIChjb3JlIHRhYmxlIHRoYXQgc2hvdWxkIGFsd2F5cyBleGlzdClcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBleGVjdXRlU3FsKFxuICAgICAgY2x1c3RlckFybixcbiAgICAgIHNlY3JldEFybixcbiAgICAgIGRhdGFiYXNlLFxuICAgICAgYFNFTEVDVCBDT1VOVCgqKSBGUk9NIGluZm9ybWF0aW9uX3NjaGVtYS50YWJsZXMgXG4gICAgICAgV0hFUkUgdGFibGVfc2NoZW1hID0gJ3B1YmxpYycgXG4gICAgICAgQU5EIHRhYmxlX25hbWUgPSAndXNlcnMnYFxuICAgICk7XG4gICAgXG4gICAgY29uc3QgY291bnQgPSByZXN1bHQucmVjb3Jkcz8uWzBdPy5bMF0/LmxvbmdWYWx1ZSB8fCAwO1xuICAgIHJldHVybiBjb3VudCA9PT0gMDtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAvLyBJZiB3ZSBjYW4ndCBjaGVjaywgYXNzdW1lIGVtcHR5IGZvciBzYWZldHlcbiAgICBjb25zb2xlLmxvZygnQ291bGQgbm90IGNoZWNrIGlmIGRhdGFiYXNlIGlzIGVtcHR5LCBhc3N1bWluZyBmcmVzaCBpbnN0YWxsJyk7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cbn1cblxuLyoqXG4gKiBFbnN1cmUgbWlncmF0aW9uIHRyYWNraW5nIHRhYmxlIGV4aXN0c1xuICogVGhpcyB0YWJsZSB0cmFja3Mgd2hpY2ggbWlncmF0aW9ucyBoYXZlIGJlZW4gcnVuXG4gKi9cbmFzeW5jIGZ1bmN0aW9uIGVuc3VyZU1pZ3JhdGlvblRhYmxlKFxuICBjbHVzdGVyQXJuOiBzdHJpbmcsXG4gIHNlY3JldEFybjogc3RyaW5nLFxuICBkYXRhYmFzZTogc3RyaW5nXG4pOiBQcm9taXNlPHZvaWQ+IHtcbiAgLy8gVGhpcyBleGFjdGx5IG1hdGNoZXMgdGhlIGV4aXN0aW5nIG1pZ3JhdGlvbl9sb2cgc3RydWN0dXJlIGZyb20gSnVuZSAyMDI1IGRhdGFiYXNlXG4gIGNvbnN0IHNxbCA9IGBcbiAgICBDUkVBVEUgVEFCTEUgSUYgTk9UIEVYSVNUUyBtaWdyYXRpb25fbG9nIChcbiAgICAgIGlkIFNFUklBTCBQUklNQVJZIEtFWSxcbiAgICAgIHN0ZXBfbnVtYmVyIElOVEVHRVIgTk9UIE5VTEwsXG4gICAgICBkZXNjcmlwdGlvbiBURVhUIE5PVCBOVUxMLFxuICAgICAgc3FsX2V4ZWN1dGVkIFRFWFQsXG4gICAgICBzdGF0dXMgVkFSQ0hBUigyMCkgREVGQVVMVCAncGVuZGluZycsXG4gICAgICBlcnJvcl9tZXNzYWdlIFRFWFQsXG4gICAgICBleGVjdXRlZF9hdCBUSU1FU1RBTVAgREVGQVVMVCBDVVJSRU5UX1RJTUVTVEFNUFxuICAgIClcbiAgYDtcbiAgXG4gIGF3YWl0IGV4ZWN1dGVTcWwoY2x1c3RlckFybiwgc2VjcmV0QXJuLCBkYXRhYmFzZSwgc3FsKTtcbn1cblxuLyoqXG4gKiBDaGVjayBpZiBhIHNwZWNpZmljIG1pZ3JhdGlvbiBoYXMgYWxyZWFkeSBiZWVuIHJ1blxuICovXG5hc3luYyBmdW5jdGlvbiBjaGVja01pZ3JhdGlvblJ1bihcbiAgY2x1c3RlckFybjogc3RyaW5nLFxuICBzZWNyZXRBcm46IHN0cmluZyxcbiAgZGF0YWJhc2U6IHN0cmluZyxcbiAgbWlncmF0aW9uRmlsZTogc3RyaW5nXG4pOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgdHJ5IHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBleGVjdXRlU3FsKFxuICAgICAgY2x1c3RlckFybixcbiAgICAgIHNlY3JldEFybixcbiAgICAgIGRhdGFiYXNlLFxuICAgICAgYFNFTEVDVCBDT1VOVCgqKSBGUk9NIG1pZ3JhdGlvbl9sb2cgXG4gICAgICAgV0hFUkUgZGVzY3JpcHRpb24gPSAnJHttaWdyYXRpb25GaWxlfScgXG4gICAgICAgQU5EIHN0YXR1cyA9ICdjb21wbGV0ZWQnYFxuICAgICk7XG4gICAgXG4gICAgY29uc3QgY291bnQgPSByZXN1bHQucmVjb3Jkcz8uWzBdPy5bMF0/LmxvbmdWYWx1ZSB8fCAwO1xuICAgIHJldHVybiBjb3VudCA+IDA7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgLy8gSWYgd2UgY2FuJ3QgY2hlY2ssIGFzc3VtZSBub3QgcnVuXG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG59XG5cbi8qKlxuICogUmVjb3JkIGEgbWlncmF0aW9uIGV4ZWN1dGlvbiAoc3VjY2VzcyBvciBmYWlsdXJlKVxuICovXG5hc3luYyBmdW5jdGlvbiByZWNvcmRNaWdyYXRpb24oXG4gIGNsdXN0ZXJBcm46IHN0cmluZyxcbiAgc2VjcmV0QXJuOiBzdHJpbmcsXG4gIGRhdGFiYXNlOiBzdHJpbmcsXG4gIG1pZ3JhdGlvbkZpbGU6IHN0cmluZyxcbiAgc3VjY2VzczogYm9vbGVhbixcbiAgZXhlY3V0aW9uVGltZTogbnVtYmVyLFxuICBlcnJvck1lc3NhZ2U/OiBzdHJpbmdcbik6IFByb21pc2U8dm9pZD4ge1xuICBjb25zdCBtYXhTdGVwUmVzdWx0ID0gYXdhaXQgZXhlY3V0ZVNxbChcbiAgICBjbHVzdGVyQXJuLFxuICAgIHNlY3JldEFybixcbiAgICBkYXRhYmFzZSxcbiAgICBgU0VMRUNUIENPQUxFU0NFKE1BWChzdGVwX251bWJlciksIDApICsgMSBhcyBuZXh0X3N0ZXAgRlJPTSBtaWdyYXRpb25fbG9nYFxuICApO1xuICBcbiAgY29uc3QgbmV4dFN0ZXAgPSBtYXhTdGVwUmVzdWx0LnJlY29yZHM/LlswXT8uWzBdPy5sb25nVmFsdWUgfHwgMTtcbiAgXG4gIGNvbnN0IHN0YXR1cyA9IHN1Y2Nlc3MgPyAnY29tcGxldGVkJyA6ICdmYWlsZWQnO1xuICBjb25zdCBlcnJvclBhcnQgPSBlcnJvck1lc3NhZ2UgPyBgLCBlcnJvcl9tZXNzYWdlID0gJyR7ZXJyb3JNZXNzYWdlLnJlcGxhY2UoLycvZywgXCInJ1wiKX0nYCA6ICcnO1xuICBcbiAgYXdhaXQgZXhlY3V0ZVNxbChcbiAgICBjbHVzdGVyQXJuLFxuICAgIHNlY3JldEFybixcbiAgICBkYXRhYmFzZSxcbiAgICBgSU5TRVJUIElOVE8gbWlncmF0aW9uX2xvZyAoc3RlcF9udW1iZXIsIGRlc2NyaXB0aW9uLCBzcWxfZXhlY3V0ZWQsIHN0YXR1cyR7ZXJyb3JNZXNzYWdlID8gJywgZXJyb3JfbWVzc2FnZScgOiAnJ30pIFxuICAgICBWQUxVRVMgKCR7bmV4dFN0ZXB9LCAnJHttaWdyYXRpb25GaWxlfScsICdNaWdyYXRpb24gZmlsZSBleGVjdXRlZCcsICcke3N0YXR1c30nJHtlcnJvck1lc3NhZ2UgPyBgLCAnJHtlcnJvck1lc3NhZ2UucmVwbGFjZSgvJy9nLCBcIicnXCIpfSdgIDogJyd9KWBcbiAgKTtcbn1cblxuLyoqXG4gKiBFeGVjdXRlIGFsbCBzdGF0ZW1lbnRzIGluIGEgU1FMIGZpbGVcbiAqL1xuYXN5bmMgZnVuY3Rpb24gZXhlY3V0ZUZpbGVTdGF0ZW1lbnRzKFxuICBjbHVzdGVyQXJuOiBzdHJpbmcsXG4gIHNlY3JldEFybjogc3RyaW5nLFxuICBkYXRhYmFzZTogc3RyaW5nLFxuICBmaWxlbmFtZTogc3RyaW5nXG4pOiBQcm9taXNlPHZvaWQ+IHtcbiAgY29uc3Qgc3FsID0gYXdhaXQgZ2V0U3FsQ29udGVudChmaWxlbmFtZSk7XG4gIGNvbnN0IHN0YXRlbWVudHMgPSBzcGxpdFNxbFN0YXRlbWVudHMoc3FsKTtcbiAgXG4gIGZvciAoY29uc3Qgc3RhdGVtZW50IG9mIHN0YXRlbWVudHMpIHtcbiAgICBpZiAoc3RhdGVtZW50LnRyaW0oKSkge1xuICAgICAgdHJ5IHtcbiAgICAgICAgYXdhaXQgZXhlY3V0ZVNxbChjbHVzdGVyQXJuLCBzZWNyZXRBcm4sIGRhdGFiYXNlLCBzdGF0ZW1lbnQpO1xuICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAvLyBGb3IgaW5pdGlhbCBzZXR1cCBmaWxlcywgd2UgbWlnaHQgd2FudCB0byBjb250aW51ZSBvbiBcImFscmVhZHkgZXhpc3RzXCIgZXJyb3JzXG4gICAgICAgIC8vIEZvciBtaWdyYXRpb25zLCB3ZSBzaG91bGQgZmFpbCBmYXN0XG4gICAgICAgIGlmIChJTklUSUFMX1NFVFVQX0ZJTEVTLmluY2x1ZGVzKGZpbGVuYW1lKSAmJiBcbiAgICAgICAgICAgIChlcnJvci5tZXNzYWdlPy5pbmNsdWRlcygnYWxyZWFkeSBleGlzdHMnKSB8fCBcbiAgICAgICAgICAgICBlcnJvci5tZXNzYWdlPy5pbmNsdWRlcygnZHVwbGljYXRlIGtleScpKSkge1xuICAgICAgICAgIGNvbnNvbGUubG9nKGDimqDvuI8gIFNraXBwaW5nIChhbHJlYWR5IGV4aXN0cyk6ICR7ZXJyb3IubWVzc2FnZX1gKTtcbiAgICAgICAgfSBlbHNlIGlmIChNSUdSQVRJT05fRklMRVMuaW5jbHVkZXMoZmlsZW5hbWUpKSB7XG4gICAgICAgICAgLy8gRm9yIG1pZ3JhdGlvbiBmaWxlcywgY2hlY2sgaWYgaXQncyBhbiBBTFRFUiBUQUJMRSB0aGF0IGFjdHVhbGx5IHN1Y2NlZWRlZFxuICAgICAgICAgIC8vIFJEUyBEYXRhIEFQSSBzb21ldGltZXMgcmV0dXJucyBhbiBlcnJvci1saWtlIHJlc3BvbnNlIGZvciBzdWNjZXNzZnVsIEFMVEVSIFRBQkxFc1xuICAgICAgICAgIGNvbnN0IGlzQWx0ZXJUYWJsZSA9IHN0YXRlbWVudC50cmltKCkudG9VcHBlckNhc2UoKS5zdGFydHNXaXRoKCdBTFRFUiBUQUJMRScpO1xuICAgICAgICAgIFxuICAgICAgICAgIGlmIChpc0FsdGVyVGFibGUpIHtcbiAgICAgICAgICAgIC8vIFZlcmlmeSBpZiB0aGUgQUxURVIgYWN0dWFsbHkgc3VjY2VlZGVkIGJ5IGNoZWNraW5nIHRoZSB0YWJsZSBzdHJ1Y3R1cmVcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKGDimqDvuI8gIEFMVEVSIFRBQkxFIG1heSBoYXZlIHN1Y2NlZWRlZCBkZXNwaXRlIGVycm9yIHJlc3BvbnNlLiBWZXJpZnlpbmcuLi5gKTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgLy8gRXh0cmFjdCB0YWJsZSBuYW1lIGFuZCBjb2x1bW4gZnJvbSBBTFRFUiBzdGF0ZW1lbnRcbiAgICAgICAgICAgIGNvbnN0IGFsdGVyTWF0Y2ggPSBzdGF0ZW1lbnQubWF0Y2goL0FMVEVSXFxzK1RBQkxFXFxzKyhcXHcrKVxccytBRERcXHMrQ09MVU1OXFxzKyhJRlxccytOT1RcXHMrRVhJU1RTXFxzKyk/KFxcdyspL2kpO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBpZiAoYWx0ZXJNYXRjaCkge1xuICAgICAgICAgICAgICBjb25zdCB0YWJsZU5hbWUgPSBhbHRlck1hdGNoWzFdO1xuICAgICAgICAgICAgICBjb25zdCBjb2x1bW5OYW1lID0gYWx0ZXJNYXRjaFszXTtcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgLy8gQ2hlY2sgaWYgdGhlIGNvbHVtbiBleGlzdHNcbiAgICAgICAgICAgICAgICBjb25zdCBjaGVja1Jlc3VsdCA9IGF3YWl0IGV4ZWN1dGVTcWwoXG4gICAgICAgICAgICAgICAgICBjbHVzdGVyQXJuLFxuICAgICAgICAgICAgICAgICAgc2VjcmV0QXJuLFxuICAgICAgICAgICAgICAgICAgZGF0YWJhc2UsXG4gICAgICAgICAgICAgICAgICBgU0VMRUNUIGNvbHVtbl9uYW1lIEZST00gaW5mb3JtYXRpb25fc2NoZW1hLmNvbHVtbnMgXG4gICAgICAgICAgICAgICAgICAgV0hFUkUgdGFibGVfc2NoZW1hID0gJ3B1YmxpYycgXG4gICAgICAgICAgICAgICAgICAgQU5EIHRhYmxlX25hbWUgPSAnJHt0YWJsZU5hbWV9JyBcbiAgICAgICAgICAgICAgICAgICBBTkQgY29sdW1uX25hbWUgPSAnJHtjb2x1bW5OYW1lfSdgXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBpZiAoY2hlY2tSZXN1bHQucmVjb3JkcyAmJiBjaGVja1Jlc3VsdC5yZWNvcmRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKGDinIUgQ29sdW1uICR7Y29sdW1uTmFtZX0gZXhpc3RzIGluIHRhYmxlICR7dGFibGVOYW1lfSAtIEFMVEVSIHN1Y2NlZWRlZGApO1xuICAgICAgICAgICAgICAgICAgLy8gQ29sdW1uIGV4aXN0cywgc28gdGhlIEFMVEVSIHdvcmtlZCAtIGNvbnRpbnVlXG4gICAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH0gY2F0Y2ggKGNoZWNrRXJyb3IpIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhgQ291bGQgbm90IHZlcmlmeSBjb2x1bW4gZXhpc3RlbmNlOiAke2NoZWNrRXJyb3J9YCk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgICAgXG4gICAgICAgICAgLy8gSWYgd2UgY291bGRuJ3QgdmVyaWZ5IHN1Y2Nlc3MsIHRocm93IHRoZSBvcmlnaW5hbCBlcnJvclxuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGV4ZWN1dGVTcWwoXG4gIGNsdXN0ZXJBcm46IHN0cmluZyxcbiAgc2VjcmV0QXJuOiBzdHJpbmcsXG4gIGRhdGFiYXNlOiBzdHJpbmcsXG4gIHNxbDogc3RyaW5nXG4pOiBQcm9taXNlPGFueT4ge1xuICBjb25zdCBjb21tYW5kID0gbmV3IEV4ZWN1dGVTdGF0ZW1lbnRDb21tYW5kKHtcbiAgICByZXNvdXJjZUFybjogY2x1c3RlckFybixcbiAgICBzZWNyZXRBcm46IHNlY3JldEFybixcbiAgICBkYXRhYmFzZTogZGF0YWJhc2UsXG4gICAgc3FsOiBzcWwsXG4gICAgaW5jbHVkZVJlc3VsdE1ldGFkYXRhOiB0cnVlXG4gIH0pO1xuXG4gIHRyeSB7XG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCByZHNDbGllbnQuc2VuZChjb21tYW5kKTtcbiAgICByZXR1cm4gcmVzcG9uc2U7XG4gIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAvLyBMb2cgdGhlIGZ1bGwgZXJyb3IgZm9yIGRlYnVnZ2luZ1xuICAgIGNvbnNvbGUuZXJyb3IoYFNRTCBleGVjdXRpb24gZXJyb3IgZm9yIHN0YXRlbWVudDogJHtzcWwuc3Vic3RyaW5nKDAsIDEwMCl9Li4uYCk7XG4gICAgY29uc29sZS5lcnJvcihgRXJyb3IgZGV0YWlsczpgLCBKU09OLnN0cmluZ2lmeShlcnJvciwgbnVsbCwgMikpO1xuICAgIFxuICAgIC8vIENoZWNrIGlmIHRoaXMgaXMgYSBmYWxzZS1wb3NpdGl2ZSBlcnJvciBmb3IgQUxURVIgVEFCTEVcbiAgICAvLyBSRFMgRGF0YSBBUEkgc29tZXRpbWVzIHJldHVybnMgZXJyb3JzIGZvciBzdWNjZXNzZnVsIERETCBvcGVyYXRpb25zXG4gICAgaWYgKHNxbC50cmltKCkudG9VcHBlckNhc2UoKS5zdGFydHNXaXRoKCdBTFRFUiBUQUJMRScpICYmIFxuICAgICAgICBlcnJvci5tZXNzYWdlICYmIFxuICAgICAgICAoZXJyb3IubWVzc2FnZS5pbmNsdWRlcygnRGF0YWJhc2UgcmV0dXJuZWQgU1FMIGV4Y2VwdGlvbicpIHx8IFxuICAgICAgICAgZXJyb3IubWVzc2FnZS5pbmNsdWRlcygnQmFkUmVxdWVzdEV4Y2VwdGlvbicpKSkge1xuICAgICAgY29uc29sZS5sb2coYOKaoO+4jyAgUG90ZW50aWFsIGZhbHNlLXBvc2l0aXZlIGVycm9yIGZvciBBTFRFUiBUQUJMRSAtIHdpbGwgdmVyaWZ5IGluIGNhbGxlcmApO1xuICAgIH1cbiAgICBcbiAgICB0aHJvdyBlcnJvcjtcbiAgfVxufVxuXG5mdW5jdGlvbiBzcGxpdFNxbFN0YXRlbWVudHMoc3FsOiBzdHJpbmcpOiBzdHJpbmdbXSB7XG4gIC8vIFJlbW92ZSBjb21tZW50c1xuICBjb25zdCB3aXRob3V0Q29tbWVudHMgPSBzcWxcbiAgICAuc3BsaXQoJ1xcbicpXG4gICAgLmZpbHRlcihsaW5lID0+ICFsaW5lLnRyaW0oKS5zdGFydHNXaXRoKCctLScpKVxuICAgIC5qb2luKCdcXG4nKTtcblxuICAvLyBTcGxpdCBieSBzZW1pY29sb24gYnV0IGhhbmRsZSBDUkVBVEUgVFlQRS9GVU5DVElPTiBibG9ja3Mgc3BlY2lhbGx5XG4gIGNvbnN0IHN0YXRlbWVudHM6IHN0cmluZ1tdID0gW107XG4gIGxldCBjdXJyZW50U3RhdGVtZW50ID0gJyc7XG4gIGxldCBpbkJsb2NrID0gZmFsc2U7XG4gIFxuICBjb25zdCBsaW5lcyA9IHdpdGhvdXRDb21tZW50cy5zcGxpdCgnXFxuJyk7XG4gIFxuICBmb3IgKGNvbnN0IGxpbmUgb2YgbGluZXMpIHtcbiAgICBjb25zdCB0cmltbWVkTGluZSA9IGxpbmUudHJpbSgpLnRvVXBwZXJDYXNlKCk7XG4gICAgXG4gICAgLy8gQ2hlY2sgaWYgd2UncmUgZW50ZXJpbmcgYSBibG9jayAoQ1JFQVRFIFRZUEUsIENSRUFURSBGVU5DVElPTiwgZXRjLilcbiAgICBpZiAodHJpbW1lZExpbmUuc3RhcnRzV2l0aCgnQ1JFQVRFIFRZUEUnKSB8fCBcbiAgICAgICAgdHJpbW1lZExpbmUuc3RhcnRzV2l0aCgnQ1JFQVRFIEZVTkNUSU9OJykgfHxcbiAgICAgICAgdHJpbW1lZExpbmUuc3RhcnRzV2l0aCgnQ1JFQVRFIE9SIFJFUExBQ0UgRlVOQ1RJT04nKSB8fFxuICAgICAgICB0cmltbWVkTGluZS5zdGFydHNXaXRoKCdEUk9QIFRZUEUnKSkge1xuICAgICAgaW5CbG9jayA9IHRydWU7XG4gICAgfVxuICAgIFxuICAgIGN1cnJlbnRTdGF0ZW1lbnQgKz0gbGluZSArICdcXG4nO1xuICAgIFxuICAgIC8vIENoZWNrIGlmIHRoaXMgbGluZSBlbmRzIHdpdGggYSBzZW1pY29sb25cbiAgICBpZiAobGluZS50cmltKCkuZW5kc1dpdGgoJzsnKSkge1xuICAgICAgLy8gSWYgd2UncmUgaW4gYSBibG9jaywgY2hlY2sgaWYgdGhpcyBpcyB0aGUgZW5kXG4gICAgICBpZiAoaW5CbG9jayAmJiAodHJpbW1lZExpbmUgPT09ICcpOycgfHwgdHJpbW1lZExpbmUuZW5kc1dpdGgoJyk7JykgfHwgdHJpbW1lZExpbmUuZW5kc1dpdGgoXCInIExBTkdVQUdFIFBMUEdTUUw7XCIpKSkge1xuICAgICAgICBpbkJsb2NrID0gZmFsc2U7XG4gICAgICB9XG4gICAgICBcbiAgICAgIC8vIElmIG5vdCBpbiBhIGJsb2NrLCB0aGlzIHN0YXRlbWVudCBpcyBjb21wbGV0ZVxuICAgICAgaWYgKCFpbkJsb2NrKSB7XG4gICAgICAgIHN0YXRlbWVudHMucHVzaChjdXJyZW50U3RhdGVtZW50LnRyaW0oKSk7XG4gICAgICAgIGN1cnJlbnRTdGF0ZW1lbnQgPSAnJztcbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgXG4gIC8vIEFkZCBhbnkgcmVtYWluaW5nIHN0YXRlbWVudFxuICBpZiAoY3VycmVudFN0YXRlbWVudC50cmltKCkpIHtcbiAgICBzdGF0ZW1lbnRzLnB1c2goY3VycmVudFN0YXRlbWVudC50cmltKCkpO1xuICB9XG4gIFxuICByZXR1cm4gc3RhdGVtZW50cztcbn1cblxuLy8gTG9hZCBTUUwgY29udGVudCBmcm9tIGJ1bmRsZWQgc2NoZW1hIGZpbGVzXG5hc3luYyBmdW5jdGlvbiBnZXRTcWxDb250ZW50KGZpbGVuYW1lOiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZz4ge1xuICBjb25zdCBmcyA9IHJlcXVpcmUoJ2ZzJykucHJvbWlzZXM7XG4gIGNvbnN0IHBhdGggPSByZXF1aXJlKCdwYXRoJyk7XG4gIFxuICB0cnkge1xuICAgIC8vIFNjaGVtYSBmaWxlcyBhcmUgY29waWVkIHRvIHRoZSBMYW1iZGEgZGVwbG95bWVudCBwYWNrYWdlXG4gICAgY29uc3Qgc2NoZW1hUGF0aCA9IHBhdGguam9pbihfX2Rpcm5hbWUsICdzY2hlbWEnLCBmaWxlbmFtZSk7XG4gICAgY29uc3QgY29udGVudCA9IGF3YWl0IGZzLnJlYWRGaWxlKHNjaGVtYVBhdGgsICd1dGY4Jyk7XG4gICAgcmV0dXJuIGNvbnRlbnQ7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcihgRmFpbGVkIHRvIHJlYWQgU1FMIGZpbGUgJHtmaWxlbmFtZX06YCwgZXJyb3IpO1xuICAgIHRocm93IG5ldyBFcnJvcihgQ291bGQgbm90IGxvYWQgU1FMIGZpbGU6ICR7ZmlsZW5hbWV9YCk7XG4gIH1cbn1cblxuIl19