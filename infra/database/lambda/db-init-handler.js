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
    '034-assistant-architect-enabled-tools.sql'
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGItaW5pdC1oYW5kbGVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiZGItaW5pdC1oYW5kbGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBb0VBLDBCQWdGQztBQXBKRCw4REFBa0Y7QUFDbEYsNEVBQThGO0FBRTlGLE1BQU0sU0FBUyxHQUFHLElBQUksK0JBQWEsQ0FBQyxFQUFFLENBQUMsQ0FBQztBQUN4QyxNQUFNLGFBQWEsR0FBRyxJQUFJLDZDQUFvQixDQUFDLEVBQUUsQ0FBQyxDQUFDO0FBYW5EOzs7Ozs7Ozs7OztHQVdHO0FBRUgseURBQXlEO0FBQ3pELHlFQUF5RTtBQUN6RSxNQUFNLGVBQWUsR0FBRztJQUN0QixnQ0FBZ0M7SUFDaEMsc0JBQXNCO0lBQ3RCLHVCQUF1QjtJQUN2Qix5Q0FBeUM7SUFDekMsMkJBQTJCO0lBQzNCLGdDQUFnQztJQUNoQywwQ0FBMEM7SUFDMUMsbUNBQW1DO0lBQ25DLGlDQUFpQztJQUNqQyxxQ0FBcUM7SUFDckMsK0JBQStCO0lBQy9CLGdDQUFnQztJQUNoQyxpQ0FBaUM7SUFDakMsa0NBQWtDO0lBQ2xDLGlDQUFpQztJQUNqQyxzQkFBc0I7SUFDdEIsc0NBQXNDO0lBQ3RDLGdDQUFnQztJQUNoQyx3QkFBd0I7SUFDeEIsMENBQTBDO0lBQzFDLDJCQUEyQjtJQUMzQiwyQ0FBMkM7SUFDM0MsOERBQThEO0NBQy9ELENBQUM7QUFFRixtREFBbUQ7QUFDbkQsaUVBQWlFO0FBQ2pFLE1BQU0sbUJBQW1CLEdBQUc7SUFDMUIsZUFBZSxFQUFPLHFCQUFxQjtJQUMzQyxnQkFBZ0IsRUFBTSwwQkFBMEI7SUFDaEQscUJBQXFCLEVBQUUsK0JBQStCO0lBQ3RELGlCQUFpQixFQUFNLDhCQUE4QjtJQUNyRCxzQkFBc0IsQ0FBQyw2QkFBNkI7Q0FDckQsQ0FBQztBQUVLLEtBQUssVUFBVSxPQUFPLENBQUMsS0FBMEI7SUFDdEQsT0FBTyxDQUFDLEdBQUcsQ0FBQyxnQ0FBZ0MsRUFBRSxJQUFJLENBQUMsU0FB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O1FBQzVELE1BQU0sT0FBTyxHQUFHLE1BQU0sRUFBRSxDQUFDLFFBQVEsQ0FBQyxVQUFVLEVBQUUsTUFBTSxDQUFDLENBQUM7UUFDdEQsT0FBTyxPQUFPLENBQUM7SUFDakIsQ0FBQztJQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7UUFDZixPQUFPLENBQUMsS0FBSyxDQUFDLDJCQUEyQixRQUFRLEdBQUcsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUM3RCxNQUFNLElBQUksS0FBSyxDQUFDLDRCQUE0QixRQUFRLEVBQUUsQ0FBQyxDQUFDO0lBQzFELENBQUM7QUFDSCxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgUkRTRGF0YUNsaWVudCwgRXhlY3V0ZVN0YXRlbWVudENvbW1hbmQgfSBmcm9tICdAYXdzLXNkay9jbGllbnQtcmRzLWRhdGEnO1xuaW1wb3J0IHsgR2V0U2VjcmV0VmFsdWVDb21tYW5kLCBTZWNyZXRzTWFuYWdlckNsaWVudCB9IGZyb20gJ0Bhd3Mtc2RrL2NsaWVudC1zZWNyZXRzLW1hbmFnZXInO1xuXG5jb25zdCByZHNDbGllbnQgPSBuZXcgUkRTRGF0YUNsaWVudCh7fSk7XG5jb25zdCBzZWNyZXRzQ2xpZW50ID0gbmV3IFNlY3JldHNNYW5hZ2VyQ2xpZW50KHt9KTtcblxuaW50ZXJmYWNlIEN1c3RvbVJlc291cmNlRXZlbnQge1xuICBSZXF1ZXN0VHlwZTogJ0NyZWF0ZScgfCAnVXBkYXRlJyB8ICdEZWxldGUnO1xuICBSZXNvdXJjZVByb3BlcnRpZXM6IHtcbiAgICBDbHVzdGVyQXJuOiBzdHJpbmc7XG4gICAgU2VjcmV0QXJuOiBzdHJpbmc7XG4gICAgRGF0YWJhc2VOYW1lOiBzdHJpbmc7XG4gICAgRW52aXJvbm1lbnQ6IHN0cmluZztcbiAgfTtcbiAgUGh5c2ljYWxSZXNvdXJjZUlkPzogc3RyaW5nO1xufVxuXG4vKipcbiAqIENSSVRJQ0FMOiBEYXRhYmFzZSBJbml0aWFsaXphdGlvbiBhbmQgTWlncmF0aW9uIEhhbmRsZXJcbiAqIFxuICogVGhpcyBMYW1iZGEgaGFuZGxlcyBUV08gZGlzdGluY3Qgc2NlbmFyaW9zOlxuICogMS4gRnJlc2ggSW5zdGFsbGF0aW9uOiBSdW5zIGFsbCBpbml0aWFsIHNldHVwIGZpbGVzICgwMDEtMDA1KVxuICogMi4gRXhpc3RpbmcgRGF0YWJhc2U6IE9OTFkgcnVucyBtaWdyYXRpb24gZmlsZXMgKDAxMCspXG4gKiBcbiAqIFdBUk5JTkc6IFRoZSBpbml0aWFsIHNldHVwIGZpbGVzICgwMDEtMDA1KSBNVVNUIGV4YWN0bHkgbWF0Y2ggdGhlIGV4aXN0aW5nXG4gKiBkYXRhYmFzZSBzdHJ1Y3R1cmUgb3IgdGhleSB3aWxsIGNhdXNlIGRhdGEgY29ycnVwdGlvbiFcbiAqIFxuICogQHNlZSAvZG9jcy9kYXRhYmFzZS1yZXN0b3JhdGlvbi9EQVRBQkFTRS1NSUdSQVRJT05TLm1kIGZvciBmdWxsIGRldGFpbHNcbiAqL1xuXG4vLyBNaWdyYXRpb24gZmlsZXMgdGhhdCBzaG91bGQgQUxXQVlTIHJ1biAoYWRkaXRpdmUgb25seSlcbi8vIFRoZXNlIGZpbGVzIHNob3VsZCBPTkxZIGNyZWF0ZSBuZXcgb2JqZWN0cywgbmV2ZXIgbW9kaWZ5IGV4aXN0aW5nIG9uZXNcbmNvbnN0IE1JR1JBVElPTl9GSUxFUyA9IFtcbiAgJzAxMC1rbm93bGVkZ2UtcmVwb3NpdG9yaWVzLnNxbCcsXG4gICcxMV90ZXh0cmFjdF9qb2JzLnNxbCcsXG4gICcxMl90ZXh0cmFjdF91c2FnZS5zcWwnLFxuICAnMDEzLWFkZC1rbm93bGVkZ2UtcmVwb3NpdG9yaWVzLXRvb2wuc3FsJyxcbiAgJzAxNC1tb2RlbC1jb21wYXJpc29ucy5zcWwnLFxuICAnMDE1LWFkZC1tb2RlbC1jb21wYXJlLXRvb2wuc3FsJyxcbiAgJzAxNi1hc3Npc3RhbnQtYXJjaGl0ZWN0LXJlcG9zaXRvcmllcy5zcWwnLFxuICAnMDE3LWFkZC11c2VyLXJvbGVzLXVwZGF0ZWQtYXQuc3FsJyxcbiAgJzAxOC1tb2RlbC1yZXBsYWNlbWVudC1hdWRpdC5zcWwnLFxuICAnMDE5LWZpeC1uYXZpZ2F0aW9uLXJvbGUtZGlzcGxheS5zcWwnLFxuICAnMDIwLWFkZC11c2VyLXJvbGUtdmVyc2lvbi5zcWwnLFxuICAnMDIzLW5hdmlnYXRpb24tbXVsdGktcm9sZXMuc3FsJyxcbiAgJzAyNC1tb2RlbC1yb2xlLXJlc3RyaWN0aW9ucy5zcWwnLFxuICAnMDI2LWFkZC1tb2RlbC1jb21wYXJlLXNvdXJjZS5zcWwnLFxuICAnMDI3LW1lc3NhZ2VzLW1vZGVsLXRyYWNraW5nLnNxbCcsXG4gICcwMjgtbmV4dXMtc2NoZW1hLnNxbCcsXG4gICcwMjktYWktbW9kZWxzLW5leHVzLWVuaGFuY2VtZW50cy5zcWwnLFxuICAnMDMwLW5leHVzLXByb3ZpZGVyLW1ldHJpY3Muc3FsJyxcbiAgJzAzMS1uZXh1cy1tZXNzYWdlcy5zcWwnLFxuICAnMDMyLXJlbW92ZS1uZXh1cy1wcm92aWRlci1jb25zdHJhaW50LnNxbCcsXG4gICcwMzMtYWktc3RyZWFtaW5nLWpvYnMuc3FsJyxcbiAgJzAzNC1hc3Npc3RhbnQtYXJjaGl0ZWN0LWVuYWJsZWQtdG9vbHMuc3FsJ1xuICAvLyBBREQgTkVXIE1JR1JBVElPTlMgSEVSRSAtIHRoZXkgd2lsbCBydW4gb25jZSBhbmQgYmUgdHJhY2tlZFxuXTtcblxuLy8gSW5pdGlhbCBzZXR1cCBmaWxlcyAob25seSBydW4gb24gZW1wdHkgZGF0YWJhc2UpXG4vLyBXQVJOSU5HOiBUaGVzZSBtdXN0IEVYQUNUTFkgbWF0Y2ggZXhpc3RpbmcgZGF0YWJhc2Ugc3RydWN0dXJlIVxuY29uc3QgSU5JVElBTF9TRVRVUF9GSUxFUyA9IFtcbiAgJzAwMS1lbnVtcy5zcWwnLCAgICAgIC8vIENyZWF0ZXMgZW51bSB0eXBlc1xuICAnMDAyLXRhYmxlcy5zcWwnLCAgICAgLy8gQ3JlYXRlcyBhbGwgY29yZSB0YWJsZXNcbiAgJzAwMy1jb25zdHJhaW50cy5zcWwnLCAvLyBBZGRzIGZvcmVpZ24ga2V5IGNvbnN0cmFpbnRzXG4gICcwMDQtaW5kZXhlcy5zcWwnLCAgICAgLy8gQ3JlYXRlcyBwZXJmb3JtYW5jZSBpbmRleGVzXG4gICcwMDUtaW5pdGlhbC1kYXRhLnNxbCcgLy8gSW5zZXJ0cyByZXF1aXJlZCBzZWVkIGRhdGFcbl07XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBoYW5kbGVyKGV2ZW50OiBDdXN0b21SZXNvdXJjZUV2ZW50KTogUHJvbWlzZTxhbnk+IHtcbiAgY29uc29sZS5sb2coJ0RhdGFiYXNlIGluaXRpYWxpemF0aW9uIGV2ZW50OicsIEpTT04uc3RyaW5naWZ5KGV2ZW50LCBudWxsLCAyKSk7XG4gIGNvbnNvbGUubG9nKCdIYW5kbGVyIHZlcnNpb246IDIwMjUtMDctMzEtdjggLSBBZGRlZCByZXF1aXJlZCBpY29uIGZpZWxkJyk7XG4gIFxuICAvLyBTQUZFVFkgQ0hFQ0s6IExvZyB3aGF0IG1vZGUgd2UncmUgaW5cbiAgY29uc29sZS5sb2coYPCflI0gQ2hlY2tpbmcgZGF0YWJhc2Ugc3RhdGUgZm9yIHNhZmV0eS4uLmApO1xuXG4gIC8vIE9ubHkgcnVuIG9uIENyZWF0ZSBvciBVcGRhdGVcbiAgaWYgKGV2ZW50LlJlcXVlc3RUeXBlID09PSAnRGVsZXRlJykge1xuICAgIHJldHVybiB7XG4gICAgICBQaHlzaWNhbFJlc291cmNlSWQ6IGV2ZW50LlBoeXNpY2FsUmVzb3VyY2VJZCB8fCAnZGItaW5pdCcsXG4gICAgICBTdGF0dXM6ICdTVUNDRVNTJyxcbiAgICAgIFJlYXNvbjogJ0RlbGV0ZSBub3QgcmVxdWlyZWQgZm9yIGRhdGFiYXNlIGluaXRpYWxpemF0aW9uJ1xuICAgIH07XG4gIH1cblxuICBjb25zdCB7IENsdXN0ZXJBcm4sIFNlY3JldEFybiwgRGF0YWJhc2VOYW1lLCBFbnZpcm9ubWVudCB9ID0gZXZlbnQuUmVzb3VyY2VQcm9wZXJ0aWVzO1xuXG4gIHRyeSB7XG4gICAgLy8gQ1JJVElDQUw6IENoZWNrIGlmIHRoaXMgaXMgYSBmcmVzaCBkYXRhYmFzZSBvciBleGlzdGluZyBvbmVcbiAgICBjb25zdCBpc0RhdGFiYXNlRW1wdHkgPSBhd2FpdCBjaGVja0lmRGF0YWJhc2VFbXB0eShDbHVzdGVyQXJuLCBTZWNyZXRBcm4sIERhdGFiYXNlTmFtZSk7XG4gICAgXG4gICAgaWYgKGlzRGF0YWJhc2VFbXB0eSkge1xuICAgICAgY29uc29sZS5sb2coJ/CfhpUgRW1wdHkgZGF0YWJhc2UgZGV0ZWN0ZWQgLSBydW5uaW5nIGZ1bGwgaW5pdGlhbGl6YXRpb24nKTtcbiAgICAgIFxuICAgICAgLy8gUnVuIGluaXRpYWwgc2V0dXAgZmlsZXMgZm9yIGZyZXNoIGluc3RhbGxhdGlvblxuICAgICAgZm9yIChjb25zdCBzcWxGaWxlIG9mIElOSVRJQUxfU0VUVVBfRklMRVMpIHtcbiAgICAgICAgY29uc29sZS5sb2coYEV4ZWN1dGluZyBpbml0aWFsIHNldHVwOiAke3NxbEZpbGV9YCk7XG4gICAgICAgIGF3YWl0IGV4ZWN1dGVGaWxlU3RhdGVtZW50cyhDbHVzdGVyQXJuLCBTZWNyZXRBcm4sIERhdGFiYXNlTmFtZSwgc3FsRmlsZSk7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnNvbGUubG9nKCfinIUgRXhpc3RpbmcgZGF0YWJhc2UgZGV0ZWN0ZWQgLSBza2lwcGluZyBpbml0aWFsIHNldHVwIGZpbGVzJyk7XG4gICAgICBjb25zb2xlLmxvZygn4pqg77iPICBPTkxZIG1pZ3JhdGlvbiBmaWxlcyB3aWxsIGJlIHByb2Nlc3NlZCcpO1xuICAgIH1cblxuICAgIC8vIEFMV0FZUyBydW4gbWlncmF0aW9ucyAodGhleSBzaG91bGQgYmUgaWRlbXBvdGVudCBhbmQgc2FmZSlcbiAgICBjb25zb2xlLmxvZygn8J+UhCBQcm9jZXNzaW5nIG1pZ3JhdGlvbnMuLi4nKTtcbiAgICBcbiAgICAvLyBFbnN1cmUgbWlncmF0aW9uIHRyYWNraW5nIHRhYmxlIGV4aXN0c1xuICAgIGF3YWl0IGVuc3VyZU1pZ3JhdGlvblRhYmxlKENsdXN0ZXJBcm4sIFNlY3JldEFybiwgRGF0YWJhc2VOYW1lKTtcbiAgICBcbiAgICAvLyBSdW4gZWFjaCBtaWdyYXRpb24gdGhhdCBoYXNuJ3QgYmVlbiBydW4geWV0XG4gICAgZm9yIChjb25zdCBtaWdyYXRpb25GaWxlIG9mIE1JR1JBVElPTl9GSUxFUykge1xuICAgICAgY29uc3QgaGFzUnVuID0gYXdhaXQgY2hlY2tNaWdyYXRpb25SdW4oQ2x1c3RlckFybiwgU2VjcmV0QXJuLCBEYXRhYmFzZU5hbWUsIG1pZ3JhdGlvbkZpbGUpO1xuICAgICAgXG4gICAgICBpZiAoIWhhc1J1bikge1xuICAgICAgICBjb25zb2xlLmxvZyhg4pa277iPICBSdW5uaW5nIG1pZ3JhdGlvbjogJHttaWdyYXRpb25GaWxlfWApO1xuICAgICAgICBjb25zdCBzdGFydFRpbWUgPSBEYXRlLm5vdygpO1xuICAgICAgICBcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBhd2FpdCBleGVjdXRlRmlsZVN0YXRlbWVudHMoQ2x1c3RlckFybiwgU2VjcmV0QXJuLCBEYXRhYmFzZU5hbWUsIG1pZ3JhdGlvbkZpbGUpO1xuICAgICAgICAgIFxuICAgICAgICAgIC8vIFJlY29yZCBzdWNjZXNzZnVsIG1pZ3JhdGlvblxuICAgICAgICAgIGF3YWl0IHJlY29yZE1pZ3JhdGlvbihDbHVzdGVyQXJuLCBTZWNyZXRBcm4sIERhdGFiYXNlTmFtZSwgbWlncmF0aW9uRmlsZSwgdHJ1ZSwgRGF0ZS5ub3coKSAtIHN0YXJ0VGltZSk7XG4gICAgICAgICAgY29uc29sZS5sb2coYOKchSBNaWdyYXRpb24gJHttaWdyYXRpb25GaWxlfSBjb21wbGV0ZWQgc3VjY2Vzc2Z1bGx5YCk7XG4gICAgICAgICAgXG4gICAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAgICAgICAvLyBSZWNvcmQgZmFpbGVkIG1pZ3JhdGlvblxuICAgICAgICAgIGF3YWl0IHJlY29yZE1pZ3JhdGlvbihDbHVzdGVyQXJuLCBTZWNyZXRBcm4sIERhdGFiYXNlTmFtZSwgbWlncmF0aW9uRmlsZSwgZmFsc2UsIERhdGUubm93KCkgLSBzdGFydFRpbWUsIGVycm9yLm1lc3NhZ2UpO1xuICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgTWlncmF0aW9uICR7bWlncmF0aW9uRmlsZX0gZmFpbGVkOiAke2Vycm9yLm1lc3NhZ2V9YCk7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbnNvbGUubG9nKGDij63vuI8gIFNraXBwaW5nIG1pZ3JhdGlvbiAke21pZ3JhdGlvbkZpbGV9IC0gYWxyZWFkeSBydW5gKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgUGh5c2ljYWxSZXNvdXJjZUlkOiAnZGItaW5pdCcsXG4gICAgICBTdGF0dXM6ICdTVUNDRVNTJyxcbiAgICAgIFJlYXNvbjogJ0RhdGFiYXNlIGluaXRpYWxpemF0aW9uL21pZ3JhdGlvbiBjb21wbGV0ZWQgc3VjY2Vzc2Z1bGx5J1xuICAgIH07XG5cbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCfinYwgRGF0YWJhc2Ugb3BlcmF0aW9uIGZhaWxlZDonLCBlcnJvcik7XG4gICAgcmV0dXJuIHtcbiAgICAgIFBoeXNpY2FsUmVzb3VyY2VJZDogJ2RiLWluaXQnLFxuICAgICAgU3RhdHVzOiAnRkFJTEVEJyxcbiAgICAgIFJlYXNvbjogYERhdGFiYXNlIG9wZXJhdGlvbiBmYWlsZWQ6ICR7ZXJyb3J9YFxuICAgIH07XG4gIH1cbn1cblxuLyoqXG4gKiBDaGVjayBpZiBkYXRhYmFzZSBpcyBlbXB0eSAoZnJlc2ggaW5zdGFsbGF0aW9uKVxuICogUmV0dXJucyB0cnVlIGlmIG5vIGNvcmUgdGFibGVzIGV4aXN0LCBmYWxzZSBpZiBkYXRhYmFzZSBoYXMgYmVlbiBpbml0aWFsaXplZFxuICovXG5hc3luYyBmdW5jdGlvbiBjaGVja0lmRGF0YWJhc2VFbXB0eShcbiAgY2x1c3RlckFybjogc3RyaW5nLFxuICBzZWNyZXRBcm46IHN0cmluZyxcbiAgZGF0YWJhc2U6IHN0cmluZ1xuKTogUHJvbWlzZTxib29sZWFuPiB7XG4gIHRyeSB7XG4gICAgLy8gQ2hlY2sgaWYgdXNlcnMgdGFibGUgZXhpc3RzIChjb3JlIHRhYmxlIHRoYXQgc2hvdWxkIGFsd2F5cyBleGlzdClcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBleGVjdXRlU3FsKFxuICAgICAgY2x1c3RlckFybixcbiAgICAgIHNlY3JldEFybixcbiAgICAgIGRhdGFiYXNlLFxuICAgICAgYFNFTEVDVCBDT1VOVCgqKSBGUk9NIGluZm9ybWF0aW9uX3NjaGVtYS50YWJsZXMgXG4gICAgICAgV0hFUkUgdGFibGVfc2NoZW1hID0gJ3B1YmxpYycgXG4gICAgICAgQU5EIHRhYmxlX25hbWUgPSAndXNlcnMnYFxuICAgICk7XG4gICAgXG4gICAgY29uc3QgY291bnQgPSByZXN1bHQucmVjb3Jkcz8uWzBdPy5bMF0/LmxvbmdWYWx1ZSB8fCAwO1xuICAgIHJldHVybiBjb3VudCA9PT0gMDtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAvLyBJZiB3ZSBjYW4ndCBjaGVjaywgYXNzdW1lIGVtcHR5IGZvciBzYWZldHlcbiAgICBjb25zb2xlLmxvZygnQ291bGQgbm90IGNoZWNrIGlmIGRhdGFiYXNlIGlzIGVtcHR5LCBhc3N1bWluZyBmcmVzaCBpbnN0YWxsJyk7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cbn1cblxuLyoqXG4gKiBFbnN1cmUgbWlncmF0aW9uIHRyYWNraW5nIHRhYmxlIGV4aXN0c1xuICogVGhpcyB0YWJsZSB0cmFja3Mgd2hpY2ggbWlncmF0aW9ucyBoYXZlIGJlZW4gcnVuXG4gKi9cbmFzeW5jIGZ1bmN0aW9uIGVuc3VyZU1pZ3JhdGlvblRhYmxlKFxuICBjbHVzdGVyQXJuOiBzdHJpbmcsXG4gIHNlY3JldEFybjogc3RyaW5nLFxuICBkYXRhYmFzZTogc3RyaW5nXG4pOiBQcm9taXNlPHZvaWQ+IHtcbiAgLy8gVGhpcyBleGFjdGx5IG1hdGNoZXMgdGhlIGV4aXN0aW5nIG1pZ3JhdGlvbl9sb2cgc3RydWN0dXJlIGZyb20gSnVuZSAyMDI1IGRhdGFiYXNlXG4gIGNvbnN0IHNxbCA9IGBcbiAgICBDUkVBVEUgVEFCTEUgSUYgTk9UIEVYSVNUUyBtaWdyYXRpb25fbG9nIChcbiAgICAgIGlkIFNFUklBTCBQUklNQVJZIEtFWSxcbiAgICAgIHN0ZXBfbnVtYmVyIElOVEVHRVIgTk9UIE5VTEwsXG4gICAgICBkZXNjcmlwdGlvbiBURVhUIE5PVCBOVUxMLFxuICAgICAgc3FsX2V4ZWN1dGVkIFRFWFQsXG4gICAgICBzdGF0dXMgVkFSQ0hBUigyMCkgREVGQVVMVCAncGVuZGluZycsXG4gICAgICBlcnJvcl9tZXNzYWdlIFRFWFQsXG4gICAgICBleGVjdXRlZF9hdCBUSU1FU1RBTVAgREVGQVVMVCBDVVJSRU5UX1RJTUVTVEFNUFxuICAgIClcbiAgYDtcbiAgXG4gIGF3YWl0IGV4ZWN1dGVTcWwoY2x1c3RlckFybiwgc2VjcmV0QXJuLCBkYXRhYmFzZSwgc3FsKTtcbn1cblxuLyoqXG4gKiBDaGVjayBpZiBhIHNwZWNpZmljIG1pZ3JhdGlvbiBoYXMgYWxyZWFkeSBiZWVuIHJ1blxuICovXG5hc3luYyBmdW5jdGlvbiBjaGVja01pZ3JhdGlvblJ1bihcbiAgY2x1c3RlckFybjogc3RyaW5nLFxuICBzZWNyZXRBcm46IHN0cmluZyxcbiAgZGF0YWJhc2U6IHN0cmluZyxcbiAgbWlncmF0aW9uRmlsZTogc3RyaW5nXG4pOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgdHJ5IHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBleGVjdXRlU3FsKFxuICAgICAgY2x1c3RlckFybixcbiAgICAgIHNlY3JldEFybixcbiAgICAgIGRhdGFiYXNlLFxuICAgICAgYFNFTEVDVCBDT1VOVCgqKSBGUk9NIG1pZ3JhdGlvbl9sb2cgXG4gICAgICAgV0hFUkUgZGVzY3JpcHRpb24gPSAnJHttaWdyYXRpb25GaWxlfScgXG4gICAgICAgQU5EIHN0YXR1cyA9ICdjb21wbGV0ZWQnYFxuICAgICk7XG4gICAgXG4gICAgY29uc3QgY291bnQgPSByZXN1bHQucmVjb3Jkcz8uWzBdPy5bMF0/LmxvbmdWYWx1ZSB8fCAwO1xuICAgIHJldHVybiBjb3VudCA+IDA7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgLy8gSWYgd2UgY2FuJ3QgY2hlY2ssIGFzc3VtZSBub3QgcnVuXG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG59XG5cbi8qKlxuICogUmVjb3JkIGEgbWlncmF0aW9uIGV4ZWN1dGlvbiAoc3VjY2VzcyBvciBmYWlsdXJlKVxuICovXG5hc3luYyBmdW5jdGlvbiByZWNvcmRNaWdyYXRpb24oXG4gIGNsdXN0ZXJBcm46IHN0cmluZyxcbiAgc2VjcmV0QXJuOiBzdHJpbmcsXG4gIGRhdGFiYXNlOiBzdHJpbmcsXG4gIG1pZ3JhdGlvbkZpbGU6IHN0cmluZyxcbiAgc3VjY2VzczogYm9vbGVhbixcbiAgZXhlY3V0aW9uVGltZTogbnVtYmVyLFxuICBlcnJvck1lc3NhZ2U/OiBzdHJpbmdcbik6IFByb21pc2U8dm9pZD4ge1xuICBjb25zdCBtYXhTdGVwUmVzdWx0ID0gYXdhaXQgZXhlY3V0ZVNxbChcbiAgICBjbHVzdGVyQXJuLFxuICAgIHNlY3JldEFybixcbiAgICBkYXRhYmFzZSxcbiAgICBgU0VMRUNUIENPQUxFU0NFKE1BWChzdGVwX251bWJlciksIDApICsgMSBhcyBuZXh0X3N0ZXAgRlJPTSBtaWdyYXRpb25fbG9nYFxuICApO1xuICBcbiAgY29uc3QgbmV4dFN0ZXAgPSBtYXhTdGVwUmVzdWx0LnJlY29yZHM/LlswXT8uWzBdPy5sb25nVmFsdWUgfHwgMTtcbiAgXG4gIGNvbnN0IHN0YXR1cyA9IHN1Y2Nlc3MgPyAnY29tcGxldGVkJyA6ICdmYWlsZWQnO1xuICBjb25zdCBlcnJvclBhcnQgPSBlcnJvck1lc3NhZ2UgPyBgLCBlcnJvcl9tZXNzYWdlID0gJyR7ZXJyb3JNZXNzYWdlLnJlcGxhY2UoLycvZywgXCInJ1wiKX0nYCA6ICcnO1xuICBcbiAgYXdhaXQgZXhlY3V0ZVNxbChcbiAgICBjbHVzdGVyQXJuLFxuICAgIHNlY3JldEFybixcbiAgICBkYXRhYmFzZSxcbiAgICBgSU5TRVJUIElOVE8gbWlncmF0aW9uX2xvZyAoc3RlcF9udW1iZXIsIGRlc2NyaXB0aW9uLCBzcWxfZXhlY3V0ZWQsIHN0YXR1cyR7ZXJyb3JNZXNzYWdlID8gJywgZXJyb3JfbWVzc2FnZScgOiAnJ30pIFxuICAgICBWQUxVRVMgKCR7bmV4dFN0ZXB9LCAnJHttaWdyYXRpb25GaWxlfScsICdNaWdyYXRpb24gZmlsZSBleGVjdXRlZCcsICcke3N0YXR1c30nJHtlcnJvck1lc3NhZ2UgPyBgLCAnJHtlcnJvck1lc3NhZ2UucmVwbGFjZSgvJy9nLCBcIicnXCIpfSdgIDogJyd9KWBcbiAgKTtcbn1cblxuLyoqXG4gKiBFeGVjdXRlIGFsbCBzdGF0ZW1lbnRzIGluIGEgU1FMIGZpbGVcbiAqL1xuYXN5bmMgZnVuY3Rpb24gZXhlY3V0ZUZpbGVTdGF0ZW1lbnRzKFxuICBjbHVzdGVyQXJuOiBzdHJpbmcsXG4gIHNlY3JldEFybjogc3RyaW5nLFxuICBkYXRhYmFzZTogc3RyaW5nLFxuICBmaWxlbmFtZTogc3RyaW5nXG4pOiBQcm9taXNlPHZvaWQ+IHtcbiAgY29uc3Qgc3FsID0gYXdhaXQgZ2V0U3FsQ29udGVudChmaWxlbmFtZSk7XG4gIGNvbnN0IHN0YXRlbWVudHMgPSBzcGxpdFNxbFN0YXRlbWVudHMoc3FsKTtcbiAgXG4gIGZvciAoY29uc3Qgc3RhdGVtZW50IG9mIHN0YXRlbWVudHMpIHtcbiAgICBpZiAoc3RhdGVtZW50LnRyaW0oKSkge1xuICAgICAgdHJ5IHtcbiAgICAgICAgYXdhaXQgZXhlY3V0ZVNxbChjbHVzdGVyQXJuLCBzZWNyZXRBcm4sIGRhdGFiYXNlLCBzdGF0ZW1lbnQpO1xuICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAvLyBGb3IgaW5pdGlhbCBzZXR1cCBmaWxlcywgd2UgbWlnaHQgd2FudCB0byBjb250aW51ZSBvbiBcImFscmVhZHkgZXhpc3RzXCIgZXJyb3JzXG4gICAgICAgIC8vIEZvciBtaWdyYXRpb25zLCB3ZSBzaG91bGQgZmFpbCBmYXN0XG4gICAgICAgIGlmIChJTklUSUFMX1NFVFVQX0ZJTEVTLmluY2x1ZGVzKGZpbGVuYW1lKSAmJiBcbiAgICAgICAgICAgIChlcnJvci5tZXNzYWdlPy5pbmNsdWRlcygnYWxyZWFkeSBleGlzdHMnKSB8fCBcbiAgICAgICAgICAgICBlcnJvci5tZXNzYWdlPy5pbmNsdWRlcygnZHVwbGljYXRlIGtleScpKSkge1xuICAgICAgICAgIGNvbnNvbGUubG9nKGDimqDvuI8gIFNraXBwaW5nIChhbHJlYWR5IGV4aXN0cyk6ICR7ZXJyb3IubWVzc2FnZX1gKTtcbiAgICAgICAgfSBlbHNlIGlmIChNSUdSQVRJT05fRklMRVMuaW5jbHVkZXMoZmlsZW5hbWUpKSB7XG4gICAgICAgICAgLy8gRm9yIG1pZ3JhdGlvbiBmaWxlcywgY2hlY2sgaWYgaXQncyBhbiBBTFRFUiBUQUJMRSB0aGF0IGFjdHVhbGx5IHN1Y2NlZWRlZFxuICAgICAgICAgIC8vIFJEUyBEYXRhIEFQSSBzb21ldGltZXMgcmV0dXJucyBhbiBlcnJvci1saWtlIHJlc3BvbnNlIGZvciBzdWNjZXNzZnVsIEFMVEVSIFRBQkxFc1xuICAgICAgICAgIGNvbnN0IGlzQWx0ZXJUYWJsZSA9IHN0YXRlbWVudC50cmltKCkudG9VcHBlckNhc2UoKS5zdGFydHNXaXRoKCdBTFRFUiBUQUJMRScpO1xuICAgICAgICAgIFxuICAgICAgICAgIGlmIChpc0FsdGVyVGFibGUpIHtcbiAgICAgICAgICAgIC8vIFZlcmlmeSBpZiB0aGUgQUxURVIgYWN0dWFsbHkgc3VjY2VlZGVkIGJ5IGNoZWNraW5nIHRoZSB0YWJsZSBzdHJ1Y3R1cmVcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKGDimqDvuI8gIEFMVEVSIFRBQkxFIG1heSBoYXZlIHN1Y2NlZWRlZCBkZXNwaXRlIGVycm9yIHJlc3BvbnNlLiBWZXJpZnlpbmcuLi5gKTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgLy8gRXh0cmFjdCB0YWJsZSBuYW1lIGFuZCBjb2x1bW4gZnJvbSBBTFRFUiBzdGF0ZW1lbnRcbiAgICAgICAgICAgIGNvbnN0IGFsdGVyTWF0Y2ggPSBzdGF0ZW1lbnQubWF0Y2goL0FMVEVSXFxzK1RBQkxFXFxzKyhcXHcrKVxccytBRERcXHMrQ09MVU1OXFxzKyhJRlxccytOT1RcXHMrRVhJU1RTXFxzKyk/KFxcdyspL2kpO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBpZiAoYWx0ZXJNYXRjaCkge1xuICAgICAgICAgICAgICBjb25zdCB0YWJsZU5hbWUgPSBhbHRlck1hdGNoWzFdO1xuICAgICAgICAgICAgICBjb25zdCBjb2x1bW5OYW1lID0gYWx0ZXJNYXRjaFszXTtcbiAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgLy8gQ2hlY2sgaWYgdGhlIGNvbHVtbiBleGlzdHNcbiAgICAgICAgICAgICAgICBjb25zdCBjaGVja1Jlc3VsdCA9IGF3YWl0IGV4ZWN1dGVTcWwoXG4gICAgICAgICAgICAgICAgICBjbHVzdGVyQXJuLFxuICAgICAgICAgICAgICAgICAgc2VjcmV0QXJuLFxuICAgICAgICAgICAgICAgICAgZGF0YWJhc2UsXG4gICAgICAgICAgICAgICAgICBgU0VMRUNUIGNvbHVtbl9uYW1lIEZST00gaW5mb3JtYXRpb25fc2NoZW1hLmNvbHVtbnMgXG4gICAgICAgICAgICAgICAgICAgV0hFUkUgdGFibGVfc2NoZW1hID0gJ3B1YmxpYycgXG4gICAgICAgICAgICAgICAgICAgQU5EIHRhYmxlX25hbWUgPSAnJHt0YWJsZU5hbWV9JyBcbiAgICAgICAgICAgICAgICAgICBBTkQgY29sdW1uX25hbWUgPSAnJHtjb2x1bW5OYW1lfSdgXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBpZiAoY2hlY2tSZXN1bHQucmVjb3JkcyAmJiBjaGVja1Jlc3VsdC5yZWNvcmRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKGDinIUgQ29sdW1uICR7Y29sdW1uTmFtZX0gZXhpc3RzIGluIHRhYmxlICR7dGFibGVOYW1lfSAtIEFMVEVSIHN1Y2NlZWRlZGApO1xuICAgICAgICAgICAgICAgICAgLy8gQ29sdW1uIGV4aXN0cywgc28gdGhlIEFMVEVSIHdvcmtlZCAtIGNvbnRpbnVlXG4gICAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH0gY2F0Y2ggKGNoZWNrRXJyb3IpIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhgQ291bGQgbm90IHZlcmlmeSBjb2x1bW4gZXhpc3RlbmNlOiAke2NoZWNrRXJyb3J9YCk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgICAgXG4gICAgICAgICAgLy8gSWYgd2UgY291bGRuJ3QgdmVyaWZ5IHN1Y2Nlc3MsIHRocm93IHRoZSBvcmlnaW5hbCBlcnJvclxuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGV4ZWN1dGVTcWwoXG4gIGNsdXN0ZXJBcm46IHN0cmluZyxcbiAgc2VjcmV0QXJuOiBzdHJpbmcsXG4gIGRhdGFiYXNlOiBzdHJpbmcsXG4gIHNxbDogc3RyaW5nXG4pOiBQcm9taXNlPGFueT4ge1xuICBjb25zdCBjb21tYW5kID0gbmV3IEV4ZWN1dGVTdGF0ZW1lbnRDb21tYW5kKHtcbiAgICByZXNvdXJjZUFybjogY2x1c3RlckFybixcbiAgICBzZWNyZXRBcm46IHNlY3JldEFybixcbiAgICBkYXRhYmFzZTogZGF0YWJhc2UsXG4gICAgc3FsOiBzcWwsXG4gICAgaW5jbHVkZVJlc3VsdE1ldGFkYXRhOiB0cnVlXG4gIH0pO1xuXG4gIHRyeSB7XG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCByZHNDbGllbnQuc2VuZChjb21tYW5kKTtcbiAgICByZXR1cm4gcmVzcG9uc2U7XG4gIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcbiAgICAvLyBMb2cgdGhlIGZ1bGwgZXJyb3IgZm9yIGRlYnVnZ2luZ1xuICAgIGNvbnNvbGUuZXJyb3IoYFNRTCBleGVjdXRpb24gZXJyb3IgZm9yIHN0YXRlbWVudDogJHtzcWwuc3Vic3RyaW5nKDAsIDEwMCl9Li4uYCk7XG4gICAgY29uc29sZS5lcnJvcihgRXJyb3IgZGV0YWlsczpgLCBKU09OLnN0cmluZ2lmeShlcnJvciwgbnVsbCwgMikpO1xuICAgIFxuICAgIC8vIENoZWNrIGlmIHRoaXMgaXMgYSBmYWxzZS1wb3NpdGl2ZSBlcnJvciBmb3IgQUxURVIgVEFCTEVcbiAgICAvLyBSRFMgRGF0YSBBUEkgc29tZXRpbWVzIHJldHVybnMgZXJyb3JzIGZvciBzdWNjZXNzZnVsIERETCBvcGVyYXRpb25zXG4gICAgaWYgKHNxbC50cmltKCkudG9VcHBlckNhc2UoKS5zdGFydHNXaXRoKCdBTFRFUiBUQUJMRScpICYmIFxuICAgICAgICBlcnJvci5tZXNzYWdlICYmIFxuICAgICAgICAoZXJyb3IubWVzc2FnZS5pbmNsdWRlcygnRGF0YWJhc2UgcmV0dXJuZWQgU1FMIGV4Y2VwdGlvbicpIHx8IFxuICAgICAgICAgZXJyb3IubWVzc2FnZS5pbmNsdWRlcygnQmFkUmVxdWVzdEV4Y2VwdGlvbicpKSkge1xuICAgICAgY29uc29sZS5sb2coYOKaoO+4jyAgUG90ZW50aWFsIGZhbHNlLXBvc2l0aXZlIGVycm9yIGZvciBBTFRFUiBUQUJMRSAtIHdpbGwgdmVyaWZ5IGluIGNhbGxlcmApO1xuICAgIH1cbiAgICBcbiAgICB0aHJvdyBlcnJvcjtcbiAgfVxufVxuXG5mdW5jdGlvbiBzcGxpdFNxbFN0YXRlbWVudHMoc3FsOiBzdHJpbmcpOiBzdHJpbmdbXSB7XG4gIC8vIFJlbW92ZSBjb21tZW50c1xuICBjb25zdCB3aXRob3V0Q29tbWVudHMgPSBzcWxcbiAgICAuc3BsaXQoJ1xcbicpXG4gICAgLmZpbHRlcihsaW5lID0+ICFsaW5lLnRyaW0oKS5zdGFydHNXaXRoKCctLScpKVxuICAgIC5qb2luKCdcXG4nKTtcblxuICAvLyBTcGxpdCBieSBzZW1pY29sb24gYnV0IGhhbmRsZSBDUkVBVEUgVFlQRS9GVU5DVElPTiBibG9ja3Mgc3BlY2lhbGx5XG4gIGNvbnN0IHN0YXRlbWVudHM6IHN0cmluZ1tdID0gW107XG4gIGxldCBjdXJyZW50U3RhdGVtZW50ID0gJyc7XG4gIGxldCBpbkJsb2NrID0gZmFsc2U7XG4gIFxuICBjb25zdCBsaW5lcyA9IHdpdGhvdXRDb21tZW50cy5zcGxpdCgnXFxuJyk7XG4gIFxuICBmb3IgKGNvbnN0IGxpbmUgb2YgbGluZXMpIHtcbiAgICBjb25zdCB0cmltbWVkTGluZSA9IGxpbmUudHJpbSgpLnRvVXBwZXJDYXNlKCk7XG4gICAgXG4gICAgLy8gQ2hlY2sgaWYgd2UncmUgZW50ZXJpbmcgYSBibG9jayAoQ1JFQVRFIFRZUEUsIENSRUFURSBGVU5DVElPTiwgZXRjLilcbiAgICBpZiAodHJpbW1lZExpbmUuc3RhcnRzV2l0aCgnQ1JFQVRFIFRZUEUnKSB8fCBcbiAgICAgICAgdHJpbW1lZExpbmUuc3RhcnRzV2l0aCgnQ1JFQVRFIEZVTkNUSU9OJykgfHxcbiAgICAgICAgdHJpbW1lZExpbmUuc3RhcnRzV2l0aCgnQ1JFQVRFIE9SIFJFUExBQ0UgRlVOQ1RJT04nKSB8fFxuICAgICAgICB0cmltbWVkTGluZS5zdGFydHNXaXRoKCdEUk9QIFRZUEUnKSkge1xuICAgICAgaW5CbG9jayA9IHRydWU7XG4gICAgfVxuICAgIFxuICAgIGN1cnJlbnRTdGF0ZW1lbnQgKz0gbGluZSArICdcXG4nO1xuICAgIFxuICAgIC8vIENoZWNrIGlmIHRoaXMgbGluZSBlbmRzIHdpdGggYSBzZW1pY29sb25cbiAgICBpZiAobGluZS50cmltKCkuZW5kc1dpdGgoJzsnKSkge1xuICAgICAgLy8gSWYgd2UncmUgaW4gYSBibG9jaywgY2hlY2sgaWYgdGhpcyBpcyB0aGUgZW5kXG4gICAgICBpZiAoaW5CbG9jayAmJiAodHJpbW1lZExpbmUgPT09ICcpOycgfHwgdHJpbW1lZExpbmUuZW5kc1dpdGgoJyk7JykgfHwgdHJpbW1lZExpbmUuZW5kc1dpdGgoXCInIExBTkdVQUdFIFBMUEdTUUw7XCIpKSkge1xuICAgICAgICBpbkJsb2NrID0gZmFsc2U7XG4gICAgICB9XG4gICAgICBcbiAgICAgIC8vIElmIG5vdCBpbiBhIGJsb2NrLCB0aGlzIHN0YXRlbWVudCBpcyBjb21wbGV0ZVxuICAgICAgaWYgKCFpbkJsb2NrKSB7XG4gICAgICAgIHN0YXRlbWVudHMucHVzaChjdXJyZW50U3RhdGVtZW50LnRyaW0oKSk7XG4gICAgICAgIGN1cnJlbnRTdGF0ZW1lbnQgPSAnJztcbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgXG4gIC8vIEFkZCBhbnkgcmVtYWluaW5nIHN0YXRlbWVudFxuICBpZiAoY3VycmVudFN0YXRlbWVudC50cmltKCkpIHtcbiAgICBzdGF0ZW1lbnRzLnB1c2goY3VycmVudFN0YXRlbWVudC50cmltKCkpO1xuICB9XG4gIFxuICByZXR1cm4gc3RhdGVtZW50cztcbn1cblxuLy8gTG9hZCBTUUwgY29udGVudCBmcm9tIGJ1bmRsZWQgc2NoZW1hIGZpbGVzXG5hc3luYyBmdW5jdGlvbiBnZXRTcWxDb250ZW50KGZpbGVuYW1lOiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZz4ge1xuICBjb25zdCBmcyA9IHJlcXVpcmUoJ2ZzJykucHJvbWlzZXM7XG4gIGNvbnN0IHBhdGggPSByZXF1aXJlKCdwYXRoJyk7XG4gIFxuICB0cnkge1xuICAgIC8vIFNjaGVtYSBmaWxlcyBhcmUgY29waWVkIHRvIHRoZSBMYW1iZGEgZGVwbG95bWVudCBwYWNrYWdlXG4gICAgY29uc3Qgc2NoZW1hUGF0aCA9IHBhdGguam9pbihfX2Rpcm5hbWUsICdzY2hlbWEnLCBmaWxlbmFtZSk7XG4gICAgY29uc3QgY29udGVudCA9IGF3YWl0IGZzLnJlYWRGaWxlKHNjaGVtYVBhdGgsICd1dGY4Jyk7XG4gICAgcmV0dXJuIGNvbnRlbnQ7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcihgRmFpbGVkIHRvIHJlYWQgU1FMIGZpbGUgJHtmaWxlbmFtZX06YCwgZXJyb3IpO1xuICAgIHRocm93IG5ldyBFcnJvcihgQ291bGQgbm90IGxvYWQgU1FMIGZpbGU6ICR7ZmlsZW5hbWV9YCk7XG4gIH1cbn1cblxuIl19