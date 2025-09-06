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
    '033-ai-streaming-jobs.sql'
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGItaW5pdC1oYW5kbGVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiZGItaW5pdC1oYW5kbGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBbUVBLDBCQWdGQztBQW5KRCw4REFBa0Y7QUFDbEYsNEVBQThGO0FBRTlGLE1BQU0sU0FBUyxHQUFHLElBQUksK0JBQWEsQ0FBQyxFQUFFLENBQUMsQ0FBQztBQUN4QyxNQUFNLGFBQWEsR0FBRyxJQUFJLDZDQUFvQixDQUFDLEVBQUUsQ0FBQyxDQUFDO0FBYW5EOzs7Ozs7Ozs7OztHQVdHO0FBRUgseURBQXlEO0FBQ3pELHlFQUF5RTtBQUN6RSxNQUFNLGVBQWUsR0FBRztJQUN0QixnQ0FBZ0M7SUFDaEMsc0JBQXNCO0lBQ3RCLHVCQUF1QjtJQUN2Qix5Q0FBeUM7SUFDekMsMkJBQTJCO0lBQzNCLGdDQUFnQztJQUNoQywwQ0FBMEM7SUFDMUMsbUNBQW1DO0lBQ25DLGlDQUFpQztJQUNqQyxxQ0FBcUM7SUFDckMsK0JBQStCO0lBQy9CLGdDQUFnQztJQUNoQyxpQ0FBaUM7SUFDakMsa0NBQWtDO0lBQ2xDLGlDQUFpQztJQUNqQyxzQkFBc0I7SUFDdEIsc0NBQXNDO0lBQ3RDLGdDQUFnQztJQUNoQyx3QkFBd0I7SUFDeEIsMENBQTBDO0lBQzFDLDJCQUEyQjtJQUMzQiw4REFBOEQ7Q0FDL0QsQ0FBQztBQUVGLG1EQUFtRDtBQUNuRCxpRUFBaUU7QUFDakUsTUFBTSxtQkFBbUIsR0FBRztJQUMxQixlQUFlLEVBQU8scUJBQXFCO0lBQzNDLGdCQUFnQixFQUFNLDBCQUEwQjtJQUNoRCxxQkFBcUIsRUFBRSwrQkFBK0I7SUFDdEQsaUJBQWlCLEVBQU0sOEJBQThCO0lBQ3JELHNCQUFzQixDQUFDLDZCQUE2QjtDQUNyRCxDQUFDO0FBRUssS0FBSyxVQUFVLE9BQU8sQ0FBQyxLQUEwQjtJQUN0RCxPQUFPLENBQUMsR0FBRyxDQUFDLGdDQUFnQyxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsS0FBSyxF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QUFPLEdBQUcsTUFBTSxFQUFFLENBQUMsUUFBUSxDQUFDLFVBQVUsRUFBRSxNQUFNLENBQUMsQ0FBQztRQUN0RCxPQUFPLE9BQU8sQ0FBQztJQUNqQixDQUFDO0lBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztRQUNmLE9BQU8sQ0FBQyxLQUFLLENBQUMsMkJBQTJCLFFBQVEsR0FBRyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQzdELE1BQU0sSUFBSSxLQUFLLENBQUMsNEJBQTRCLFFBQVEsRUFBRSxDQUFDLENBQUM7SUFDMUQsQ0FBQztBQUNILENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBSRFNEYXRhQ2xpZW50LCBFeGVjdXRlU3RhdGVtZW50Q29tbWFuZCB9IGZyb20gJ0Bhd3Mtc2RrL2NsaWVudC1yZHMtZGF0YSc7XG5pbXBvcnQgeyBHZXRTZWNyZXRWYWx1ZUNvbW1hbmQsIFNlY3JldHNNYW5hZ2VyQ2xpZW50IH0gZnJvbSAnQGF3cy1zZGsvY2xpZW50LXNlY3JldHMtbWFuYWdlcic7XG5cbmNvbnN0IHJkc0NsaWVudCA9IG5ldyBSRFNEYXRhQ2xpZW50KHt9KTtcbmNvbnN0IHNlY3JldHNDbGllbnQgPSBuZXcgU2VjcmV0c01hbmFnZXJDbGllbnQoe30pO1xuXG5pbnRlcmZhY2UgQ3VzdG9tUmVzb3VyY2VFdmVudCB7XG4gIFJlcXVlc3RUeXBlOiAnQ3JlYXRlJyB8ICdVcGRhdGUnIHwgJ0RlbGV0ZSc7XG4gIFJlc291cmNlUHJvcGVydGllczoge1xuICAgIENsdXN0ZXJBcm46IHN0cmluZztcbiAgICBTZWNyZXRBcm46IHN0cmluZztcbiAgICBEYXRhYmFzZU5hbWU6IHN0cmluZztcbiAgICBFbnZpcm9ubWVudDogc3RyaW5nO1xuICB9O1xuICBQaHlzaWNhbFJlc291cmNlSWQ/OiBzdHJpbmc7XG59XG5cbi8qKlxuICogQ1JJVElDQUw6IERhdGFiYXNlIEluaXRpYWxpemF0aW9uIGFuZCBNaWdyYXRpb24gSGFuZGxlclxuICogXG4gKiBUaGlzIExhbWJkYSBoYW5kbGVzIFRXTyBkaXN0aW5jdCBzY2VuYXJpb3M6XG4gKiAxLiBGcmVzaCBJbnN0YWxsYXRpb246IFJ1bnMgYWxsIGluaXRpYWwgc2V0dXAgZmlsZXMgKDAwMS0wMDUpXG4gKiAyLiBFeGlzdGluZyBEYXRhYmFzZTogT05MWSBydW5zIG1pZ3JhdGlvbiBmaWxlcyAoMDEwKylcbiAqIFxuICogV0FSTklORzogVGhlIGluaXRpYWwgc2V0dXAgZmlsZXMgKDAwMS0wMDUpIE1VU1QgZXhhY3RseSBtYXRjaCB0aGUgZXhpc3RpbmdcbiAqIGRhdGFiYXNlIHN0cnVjdHVyZSBvciB0aGV5IHdpbGwgY2F1c2UgZGF0YSBjb3JydXB0aW9uIVxuICogXG4gKiBAc2VlIC9kb2NzL2RhdGFiYXNlLXJlc3RvcmF0aW9uL0RBVEFCQVNFLU1JR1JBVElPTlMubWQgZm9yIGZ1bGwgZGV0YWlsc1xuICovXG5cbi8vIE1pZ3JhdGlvbiBmaWxlcyB0aGF0IHNob3VsZCBBTFdBWVMgcnVuIChhZGRpdGl2ZSBvbmx5KVxuLy8gVGhlc2UgZmlsZXMgc2hvdWxkIE9OTFkgY3JlYXRlIG5ldyBvYmplY3RzLCBuZXZlciBtb2RpZnkgZXhpc3Rpbmcgb25lc1xuY29uc3QgTUlHUkFUSU9OX0ZJTEVTID0gW1xuICAnMDEwLWtub3dsZWRnZS1yZXBvc2l0b3JpZXMuc3FsJyxcbiAgJzExX3RleHRyYWN0X2pvYnMuc3FsJyxcbiAgJzEyX3RleHRyYWN0X3VzYWdlLnNxbCcsXG4gICcwMTMtYWRkLWtub3dsZWRnZS1yZXBvc2l0b3JpZXMtdG9vbC5zcWwnLFxuICAnMDE0LW1vZGVsLWNvbXBhcmlzb25zLnNxbCcsXG4gICcwMTUtYWRkLW1vZGVsLWNvbXBhcmUtdG9vbC5zcWwnLFxuICAnMDE2LWFzc2lzdGFudC1hcmNoaXRlY3QtcmVwb3NpdG9yaWVzLnNxbCcsXG4gICcwMTctYWRkLXVzZXItcm9sZXMtdXBkYXRlZC1hdC5zcWwnLFxuICAnMDE4LW1vZGVsLXJlcGxhY2VtZW50LWF1ZGl0LnNxbCcsXG4gICcwMTktZml4LW5hdmlnYXRpb24tcm9sZS1kaXNwbGF5LnNxbCcsXG4gICcwMjAtYWRkLXVzZXItcm9sZS12ZXJzaW9uLnNxbCcsXG4gICcwMjMtbmF2aWdhdGlvbi1tdWx0aS1yb2xlcy5zcWwnLFxuICAnMDI0LW1vZGVsLXJvbGUtcmVzdHJpY3Rpb25zLnNxbCcsXG4gICcwMjYtYWRkLW1vZGVsLWNvbXBhcmUtc291cmNlLnNxbCcsXG4gICcwMjctbWVzc2FnZXMtbW9kZWwtdHJhY2tpbmcuc3FsJyxcbiAgJzAyOC1uZXh1cy1zY2hlbWEuc3FsJyxcbiAgJzAyOS1haS1tb2RlbHMtbmV4dXMtZW5oYW5jZW1lbnRzLnNxbCcsXG4gICcwMzAtbmV4dXMtcHJvdmlkZXItbWV0cmljcy5zcWwnLFxuICAnMDMxLW5leHVzLW1lc3NhZ2VzLnNxbCcsXG4gICcwMzItcmVtb3ZlLW5leHVzLXByb3ZpZGVyLWNvbnN0cmFpbnQuc3FsJyxcbiAgJzAzMy1haS1zdHJlYW1pbmctam9icy5zcWwnXG4gIC8vIEFERCBORVcgTUlHUkFUSU9OUyBIRVJFIC0gdGhleSB3aWxsIHJ1biBvbmNlIGFuZCBiZSB0cmFja2VkXG5dO1xuXG4vLyBJbml0aWFsIHNldHVwIGZpbGVzIChvbmx5IHJ1biBvbiBlbXB0eSBkYXRhYmFzZSlcbi8vIFdBUk5JTkc6IFRoZXNlIG11c3QgRVhBQ1RMWSBtYXRjaCBleGlzdGluZyBkYXRhYmFzZSBzdHJ1Y3R1cmUhXG5jb25zdCBJTklUSUFMX1NFVFVQX0ZJTEVTID0gW1xuICAnMDAxLWVudW1zLnNxbCcsICAgICAgLy8gQ3JlYXRlcyBlbnVtIHR5cGVzXG4gICcwMDItdGFibGVzLnNxbCcsICAgICAvLyBDcmVhdGVzIGFsbCBjb3JlIHRhYmxlc1xuICAnMDAzLWNvbnN0cmFpbnRzLnNxbCcsIC8vIEFkZHMgZm9yZWlnbiBrZXkgY29uc3RyYWludHNcbiAgJzAwNC1pbmRleGVzLnNxbCcsICAgICAvLyBDcmVhdGVzIHBlcmZvcm1hbmNlIGluZGV4ZXNcbiAgJzAwNS1pbml0aWFsLWRhdGEuc3FsJyAvLyBJbnNlcnRzIHJlcXVpcmVkIHNlZWQgZGF0YVxuXTtcblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGhhbmRsZXIoZXZlbnQ6IEN1c3RvbVJlc291cmNlRXZlbnQpOiBQcm9taXNlPGFueT4ge1xuICBjb25zb2xlLmxvZygnRGF0YWJhc2UgaW5pdGlhbGl6YXRpb24gZXZlbnQ6JywgSlNPTi5zdHJpbmdpZnkoZXZlbnQsIG51bGwsIDIpKTtcbiAgY29uc29sZS5sb2coJ0hhbmRsZXIgdmVyc2lvbjogMjAyNS0wNy0zMS12OCAtIEFkZGVkIHJlcXVpcmVkIGljb24gZmllbGQnKTtcbiAgXG4gIC8vIFNBRkVUWSBDSEVDSzogTG9nIHdoYXQgbW9kZSB3ZSdyZSBpblxuICBjb25zb2xlLmxvZyhg8J+UjSBDaGVja2luZyBkYXRhYmFzZSBzdGF0ZSBmb3Igc2FmZXR5Li4uYCk7XG5cbiAgLy8gT25seSBydW4gb24gQ3JlYXRlIG9yIFVwZGF0ZVxuICBpZiAoZXZlbnQuUmVxdWVzdFR5cGUgPT09ICdEZWxldGUnKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgIFBoeXNpY2FsUmVzb3VyY2VJZDogZXZlbnQuUGh5c2ljYWxSZXNvdXJjZUlkIHx8ICdkYi1pbml0JyxcbiAgICAgIFN0YXR1czogJ1NVQ0NFU1MnLFxuICAgICAgUmVhc29uOiAnRGVsZXRlIG5vdCByZXF1aXJlZCBmb3IgZGF0YWJhc2UgaW5pdGlhbGl6YXRpb24nXG4gICAgfTtcbiAgfVxuXG4gIGNvbnN0IHsgQ2x1c3RlckFybiwgU2VjcmV0QXJuLCBEYXRhYmFzZU5hbWUsIEVudmlyb25tZW50IH0gPSBldmVudC5SZXNvdXJjZVByb3BlcnRpZXM7XG5cbiAgdHJ5IHtcbiAgICAvLyBDUklUSUNBTDogQ2hlY2sgaWYgdGhpcyBpcyBhIGZyZXNoIGRhdGFiYXNlIG9yIGV4aXN0aW5nIG9uZVxuICAgIGNvbnN0IGlzRGF0YWJhc2VFbXB0eSA9IGF3YWl0IGNoZWNrSWZEYXRhYmFzZUVtcHR5KENsdXN0ZXJBcm4sIFNlY3JldEFybiwgRGF0YWJhc2VOYW1lKTtcbiAgICBcbiAgICBpZiAoaXNEYXRhYmFzZUVtcHR5KSB7XG4gICAgICBjb25zb2xlLmxvZygn8J+GlSBFbXB0eSBkYXRhYmFzZSBkZXRlY3RlZCAtIHJ1bm5pbmcgZnVsbCBpbml0aWFsaXphdGlvbicpO1xuICAgICAgXG4gICAgICAvLyBSdW4gaW5pdGlhbCBzZXR1cCBmaWxlcyBmb3IgZnJlc2ggaW5zdGFsbGF0aW9uXG4gICAgICBmb3IgKGNvbnN0IHNxbEZpbGUgb2YgSU5JVElBTF9TRVRVUF9GSUxFUykge1xuICAgICAgICBjb25zb2xlLmxvZyhgRXhlY3V0aW5nIGluaXRpYWwgc2V0dXA6ICR7c3FsRmlsZX1gKTtcbiAgICAgICAgYXdhaXQgZXhlY3V0ZUZpbGVTdGF0ZW1lbnRzKENsdXN0ZXJBcm4sIFNlY3JldEFybiwgRGF0YWJhc2VOYW1lLCBzcWxGaWxlKTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgY29uc29sZS5sb2coJ+KchSBFeGlzdGluZyBkYXRhYmFzZSBkZXRlY3RlZCAtIHNraXBwaW5nIGluaXRpYWwgc2V0dXAgZmlsZXMnKTtcbiAgICAgIGNvbnNvbGUubG9nKCfimqDvuI8gIE9OTFkgbWlncmF0aW9uIGZpbGVzIHdpbGwgYmUgcHJvY2Vzc2VkJyk7XG4gICAgfVxuXG4gICAgLy8gQUxXQVlTIHJ1biBtaWdyYXRpb25zICh0aGV5IHNob3VsZCBiZSBpZGVtcG90ZW50IGFuZCBzYWZlKVxuICAgIGNvbnNvbGUubG9nKCfwn5SEIFByb2Nlc3NpbmcgbWlncmF0aW9ucy4uLicpO1xuICAgIFxuICAgIC8vIEVuc3VyZSBtaWdyYXRpb24gdHJhY2tpbmcgdGFibGUgZXhpc3RzXG4gICAgYXdhaXQgZW5zdXJlTWlncmF0aW9uVGFibGUoQ2x1c3RlckFybiwgU2VjcmV0QXJuLCBEYXRhYmFzZU5hbWUpO1xuICAgIFxuICAgIC8vIFJ1biBlYWNoIG1pZ3JhdGlvbiB0aGF0IGhhc24ndCBiZWVuIHJ1biB5ZXRcbiAgICBmb3IgKGNvbnN0IG1pZ3JhdGlvbkZpbGUgb2YgTUlHUkFUSU9OX0ZJTEVTKSB7XG4gICAgICBjb25zdCBoYXNSdW4gPSBhd2FpdCBjaGVja01pZ3JhdGlvblJ1bihDbHVzdGVyQXJuLCBTZWNyZXRBcm4sIERhdGFiYXNlTmFtZSwgbWlncmF0aW9uRmlsZSk7XG4gICAgICBcbiAgICAgIGlmICghaGFzUnVuKSB7XG4gICAgICAgIGNvbnNvbGUubG9nKGDilrbvuI8gIFJ1bm5pbmcgbWlncmF0aW9uOiAke21pZ3JhdGlvbkZpbGV9YCk7XG4gICAgICAgIGNvbnN0IHN0YXJ0VGltZSA9IERhdGUubm93KCk7XG4gICAgICAgIFxuICAgICAgICB0cnkge1xuICAgICAgICAgIGF3YWl0IGV4ZWN1dGVGaWxlU3RhdGVtZW50cyhDbHVzdGVyQXJuLCBTZWNyZXRBcm4sIERhdGFiYXNlTmFtZSwgbWlncmF0aW9uRmlsZSk7XG4gICAgICAgICAgXG4gICAgICAgICAgLy8gUmVjb3JkIHN1Y2Nlc3NmdWwgbWlncmF0aW9uXG4gICAgICAgICAgYXdhaXQgcmVjb3JkTWlncmF0aW9uKENsdXN0ZXJBcm4sIFNlY3JldEFybiwgRGF0YWJhc2VOYW1lLCBtaWdyYXRpb25GaWxlLCB0cnVlLCBEYXRlLm5vdygpIC0gc3RhcnRUaW1lKTtcbiAgICAgICAgICBjb25zb2xlLmxvZyhg4pyFIE1pZ3JhdGlvbiAke21pZ3JhdGlvbkZpbGV9IGNvbXBsZXRlZCBzdWNjZXNzZnVsbHlgKTtcbiAgICAgICAgICBcbiAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgICAgIC8vIFJlY29yZCBmYWlsZWQgbWlncmF0aW9uXG4gICAgICAgICAgYXdhaXQgcmVjb3JkTWlncmF0aW9uKENsdXN0ZXJBcm4sIFNlY3JldEFybiwgRGF0YWJhc2VOYW1lLCBtaWdyYXRpb25GaWxlLCBmYWxzZSwgRGF0ZS5ub3coKSAtIHN0YXJ0VGltZSwgZXJyb3IubWVzc2FnZSk7XG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBNaWdyYXRpb24gJHttaWdyYXRpb25GaWxlfSBmYWlsZWQ6ICR7ZXJyb3IubWVzc2FnZX1gKTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29uc29sZS5sb2coYOKPre+4jyAgU2tpcHBpbmcgbWlncmF0aW9uICR7bWlncmF0aW9uRmlsZX0gLSBhbHJlYWR5IHJ1bmApO1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiB7XG4gICAgICBQaHlzaWNhbFJlc291cmNlSWQ6ICdkYi1pbml0JyxcbiAgICAgIFN0YXR1czogJ1NVQ0NFU1MnLFxuICAgICAgUmVhc29uOiAnRGF0YWJhc2UgaW5pdGlhbGl6YXRpb24vbWlncmF0aW9uIGNvbXBsZXRlZCBzdWNjZXNzZnVsbHknXG4gICAgfTtcblxuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBEYXRhYmFzZSBvcGVyYXRpb24gZmFpbGVkOicsIGVycm9yKTtcbiAgICByZXR1cm4ge1xuICAgICAgUGh5c2ljYWxSZXNvdXJjZUlkOiAnZGItaW5pdCcsXG4gICAgICBTdGF0dXM6ICdGQUlMRUQnLFxuICAgICAgUmVhc29uOiBgRGF0YWJhc2Ugb3BlcmF0aW9uIGZhaWxlZDogJHtlcnJvcn1gXG4gICAgfTtcbiAgfVxufVxuXG4vKipcbiAqIENoZWNrIGlmIGRhdGFiYXNlIGlzIGVtcHR5IChmcmVzaCBpbnN0YWxsYXRpb24pXG4gKiBSZXR1cm5zIHRydWUgaWYgbm8gY29yZSB0YWJsZXMgZXhpc3QsIGZhbHNlIGlmIGRhdGFiYXNlIGhhcyBiZWVuIGluaXRpYWxpemVkXG4gKi9cbmFzeW5jIGZ1bmN0aW9uIGNoZWNrSWZEYXRhYmFzZUVtcHR5KFxuICBjbHVzdGVyQXJuOiBzdHJpbmcsXG4gIHNlY3JldEFybjogc3RyaW5nLFxuICBkYXRhYmFzZTogc3RyaW5nXG4pOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgdHJ5IHtcbiAgICAvLyBDaGVjayBpZiB1c2VycyB0YWJsZSBleGlzdHMgKGNvcmUgdGFibGUgdGhhdCBzaG91bGQgYWx3YXlzIGV4aXN0KVxuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGV4ZWN1dGVTcWwoXG4gICAgICBjbHVzdGVyQXJuLFxuICAgICAgc2VjcmV0QXJuLFxuICAgICAgZGF0YWJhc2UsXG4gICAgICBgU0VMRUNUIENPVU5UKCopIEZST00gaW5mb3JtYXRpb25fc2NoZW1hLnRhYmxlcyBcbiAgICAgICBXSEVSRSB0YWJsZV9zY2hlbWEgPSAncHVibGljJyBcbiAgICAgICBBTkQgdGFibGVfbmFtZSA9ICd1c2VycydgXG4gICAgKTtcbiAgICBcbiAgICBjb25zdCBjb3VudCA9IHJlc3VsdC5yZWNvcmRzPy5bMF0/LlswXT8ubG9uZ1ZhbHVlIHx8IDA7XG4gICAgcmV0dXJuIGNvdW50ID09PSAwO1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIC8vIElmIHdlIGNhbid0IGNoZWNrLCBhc3N1bWUgZW1wdHkgZm9yIHNhZmV0eVxuICAgIGNvbnNvbGUubG9nKCdDb3VsZCBub3QgY2hlY2sgaWYgZGF0YWJhc2UgaXMgZW1wdHksIGFzc3VtaW5nIGZyZXNoIGluc3RhbGwnKTtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxufVxuXG4vKipcbiAqIEVuc3VyZSBtaWdyYXRpb24gdHJhY2tpbmcgdGFibGUgZXhpc3RzXG4gKiBUaGlzIHRhYmxlIHRyYWNrcyB3aGljaCBtaWdyYXRpb25zIGhhdmUgYmVlbiBydW5cbiAqL1xuYXN5bmMgZnVuY3Rpb24gZW5zdXJlTWlncmF0aW9uVGFibGUoXG4gIGNsdXN0ZXJBcm46IHN0cmluZyxcbiAgc2VjcmV0QXJuOiBzdHJpbmcsXG4gIGRhdGFiYXNlOiBzdHJpbmdcbik6IFByb21pc2U8dm9pZD4ge1xuICAvLyBUaGlzIGV4YWN0bHkgbWF0Y2hlcyB0aGUgZXhpc3RpbmcgbWlncmF0aW9uX2xvZyBzdHJ1Y3R1cmUgZnJvbSBKdW5lIDIwMjUgZGF0YWJhc2VcbiAgY29uc3Qgc3FsID0gYFxuICAgIENSRUFURSBUQUJMRSBJRiBOT1QgRVhJU1RTIG1pZ3JhdGlvbl9sb2cgKFxuICAgICAgaWQgU0VSSUFMIFBSSU1BUlkgS0VZLFxuICAgICAgc3RlcF9udW1iZXIgSU5URUdFUiBOT1QgTlVMTCxcbiAgICAgIGRlc2NyaXB0aW9uIFRFWFQgTk9UIE5VTEwsXG4gICAgICBzcWxfZXhlY3V0ZWQgVEVYVCxcbiAgICAgIHN0YXR1cyBWQVJDSEFSKDIwKSBERUZBVUxUICdwZW5kaW5nJyxcbiAgICAgIGVycm9yX21lc3NhZ2UgVEVYVCxcbiAgICAgIGV4ZWN1dGVkX2F0IFRJTUVTVEFNUCBERUZBVUxUIENVUlJFTlRfVElNRVNUQU1QXG4gICAgKVxuICBgO1xuICBcbiAgYXdhaXQgZXhlY3V0ZVNxbChjbHVzdGVyQXJuLCBzZWNyZXRBcm4sIGRhdGFiYXNlLCBzcWwpO1xufVxuXG4vKipcbiAqIENoZWNrIGlmIGEgc3BlY2lmaWMgbWlncmF0aW9uIGhhcyBhbHJlYWR5IGJlZW4gcnVuXG4gKi9cbmFzeW5jIGZ1bmN0aW9uIGNoZWNrTWlncmF0aW9uUnVuKFxuICBjbHVzdGVyQXJuOiBzdHJpbmcsXG4gIHNlY3JldEFybjogc3RyaW5nLFxuICBkYXRhYmFzZTogc3RyaW5nLFxuICBtaWdyYXRpb25GaWxlOiBzdHJpbmdcbik6IFByb21pc2U8Ym9vbGVhbj4ge1xuICB0cnkge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGV4ZWN1dGVTcWwoXG4gICAgICBjbHVzdGVyQXJuLFxuICAgICAgc2VjcmV0QXJuLFxuICAgICAgZGF0YWJhc2UsXG4gICAgICBgU0VMRUNUIENPVU5UKCopIEZST00gbWlncmF0aW9uX2xvZyBcbiAgICAgICBXSEVSRSBkZXNjcmlwdGlvbiA9ICcke21pZ3JhdGlvbkZpbGV9JyBcbiAgICAgICBBTkQgc3RhdHVzID0gJ2NvbXBsZXRlZCdgXG4gICAgKTtcbiAgICBcbiAgICBjb25zdCBjb3VudCA9IHJlc3VsdC5yZWNvcmRzPy5bMF0/LlswXT8ubG9uZ1ZhbHVlIHx8IDA7XG4gICAgcmV0dXJuIGNvdW50ID4gMDtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAvLyBJZiB3ZSBjYW4ndCBjaGVjaywgYXNzdW1lIG5vdCBydW5cbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbn1cblxuLyoqXG4gKiBSZWNvcmQgYSBtaWdyYXRpb24gZXhlY3V0aW9uIChzdWNjZXNzIG9yIGZhaWx1cmUpXG4gKi9cbmFzeW5jIGZ1bmN0aW9uIHJlY29yZE1pZ3JhdGlvbihcbiAgY2x1c3RlckFybjogc3RyaW5nLFxuICBzZWNyZXRBcm46IHN0cmluZyxcbiAgZGF0YWJhc2U6IHN0cmluZyxcbiAgbWlncmF0aW9uRmlsZTogc3RyaW5nLFxuICBzdWNjZXNzOiBib29sZWFuLFxuICBleGVjdXRpb25UaW1lOiBudW1iZXIsXG4gIGVycm9yTWVzc2FnZT86IHN0cmluZ1xuKTogUHJvbWlzZTx2b2lkPiB7XG4gIGNvbnN0IG1heFN0ZXBSZXN1bHQgPSBhd2FpdCBleGVjdXRlU3FsKFxuICAgIGNsdXN0ZXJBcm4sXG4gICAgc2VjcmV0QXJuLFxuICAgIGRhdGFiYXNlLFxuICAgIGBTRUxFQ1QgQ09BTEVTQ0UoTUFYKHN0ZXBfbnVtYmVyKSwgMCkgKyAxIGFzIG5leHRfc3RlcCBGUk9NIG1pZ3JhdGlvbl9sb2dgXG4gICk7XG4gIFxuICBjb25zdCBuZXh0U3RlcCA9IG1heFN0ZXBSZXN1bHQucmVjb3Jkcz8uWzBdPy5bMF0/LmxvbmdWYWx1ZSB8fCAxO1xuICBcbiAgY29uc3Qgc3RhdHVzID0gc3VjY2VzcyA/ICdjb21wbGV0ZWQnIDogJ2ZhaWxlZCc7XG4gIGNvbnN0IGVycm9yUGFydCA9IGVycm9yTWVzc2FnZSA/IGAsIGVycm9yX21lc3NhZ2UgPSAnJHtlcnJvck1lc3NhZ2UucmVwbGFjZSgvJy9nLCBcIicnXCIpfSdgIDogJyc7XG4gIFxuICBhd2FpdCBleGVjdXRlU3FsKFxuICAgIGNsdXN0ZXJBcm4sXG4gICAgc2VjcmV0QXJuLFxuICAgIGRhdGFiYXNlLFxuICAgIGBJTlNFUlQgSU5UTyBtaWdyYXRpb25fbG9nIChzdGVwX251bWJlciwgZGVzY3JpcHRpb24sIHNxbF9leGVjdXRlZCwgc3RhdHVzJHtlcnJvck1lc3NhZ2UgPyAnLCBlcnJvcl9tZXNzYWdlJyA6ICcnfSkgXG4gICAgIFZBTFVFUyAoJHtuZXh0U3RlcH0sICcke21pZ3JhdGlvbkZpbGV9JywgJ01pZ3JhdGlvbiBmaWxlIGV4ZWN1dGVkJywgJyR7c3RhdHVzfScke2Vycm9yTWVzc2FnZSA/IGAsICcke2Vycm9yTWVzc2FnZS5yZXBsYWNlKC8nL2csIFwiJydcIil9J2AgOiAnJ30pYFxuICApO1xufVxuXG4vKipcbiAqIEV4ZWN1dGUgYWxsIHN0YXRlbWVudHMgaW4gYSBTUUwgZmlsZVxuICovXG5hc3luYyBmdW5jdGlvbiBleGVjdXRlRmlsZVN0YXRlbWVudHMoXG4gIGNsdXN0ZXJBcm46IHN0cmluZyxcbiAgc2VjcmV0QXJuOiBzdHJpbmcsXG4gIGRhdGFiYXNlOiBzdHJpbmcsXG4gIGZpbGVuYW1lOiBzdHJpbmdcbik6IFByb21pc2U8dm9pZD4ge1xuICBjb25zdCBzcWwgPSBhd2FpdCBnZXRTcWxDb250ZW50KGZpbGVuYW1lKTtcbiAgY29uc3Qgc3RhdGVtZW50cyA9IHNwbGl0U3FsU3RhdGVtZW50cyhzcWwpO1xuICBcbiAgZm9yIChjb25zdCBzdGF0ZW1lbnQgb2Ygc3RhdGVtZW50cykge1xuICAgIGlmIChzdGF0ZW1lbnQudHJpbSgpKSB7XG4gICAgICB0cnkge1xuICAgICAgICBhd2FpdCBleGVjdXRlU3FsKGNsdXN0ZXJBcm4sIHNlY3JldEFybiwgZGF0YWJhc2UsIHN0YXRlbWVudCk7XG4gICAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XG4gICAgICAgIC8vIEZvciBpbml0aWFsIHNldHVwIGZpbGVzLCB3ZSBtaWdodCB3YW50IHRvIGNvbnRpbnVlIG9uIFwiYWxyZWFkeSBleGlzdHNcIiBlcnJvcnNcbiAgICAgICAgLy8gRm9yIG1pZ3JhdGlvbnMsIHdlIHNob3VsZCBmYWlsIGZhc3RcbiAgICAgICAgaWYgKElOSVRJQUxfU0VUVVBfRklMRVMuaW5jbHVkZXMoZmlsZW5hbWUpICYmIFxuICAgICAgICAgICAgKGVycm9yLm1lc3NhZ2U/LmluY2x1ZGVzKCdhbHJlYWR5IGV4aXN0cycpIHx8IFxuICAgICAgICAgICAgIGVycm9yLm1lc3NhZ2U/LmluY2x1ZGVzKCdkdXBsaWNhdGUga2V5JykpKSB7XG4gICAgICAgICAgY29uc29sZS5sb2coYOKaoO+4jyAgU2tpcHBpbmcgKGFscmVhZHkgZXhpc3RzKTogJHtlcnJvci5tZXNzYWdlfWApO1xuICAgICAgICB9IGVsc2UgaWYgKE1JR1JBVElPTl9GSUxFUy5pbmNsdWRlcyhmaWxlbmFtZSkpIHtcbiAgICAgICAgICAvLyBGb3IgbWlncmF0aW9uIGZpbGVzLCBjaGVjayBpZiBpdCdzIGFuIEFMVEVSIFRBQkxFIHRoYXQgYWN0dWFsbHkgc3VjY2VlZGVkXG4gICAgICAgICAgLy8gUkRTIERhdGEgQVBJIHNvbWV0aW1lcyByZXR1cm5zIGFuIGVycm9yLWxpa2UgcmVzcG9uc2UgZm9yIHN1Y2Nlc3NmdWwgQUxURVIgVEFCTEVzXG4gICAgICAgICAgY29uc3QgaXNBbHRlclRhYmxlID0gc3RhdGVtZW50LnRyaW0oKS50b1VwcGVyQ2FzZSgpLnN0YXJ0c1dpdGgoJ0FMVEVSIFRBQkxFJyk7XG4gICAgICAgICAgXG4gICAgICAgICAgaWYgKGlzQWx0ZXJUYWJsZSkge1xuICAgICAgICAgICAgLy8gVmVyaWZ5IGlmIHRoZSBBTFRFUiBhY3R1YWxseSBzdWNjZWVkZWQgYnkgY2hlY2tpbmcgdGhlIHRhYmxlIHN0cnVjdHVyZVxuICAgICAgICAgICAgY29uc29sZS5sb2coYOKaoO+4jyAgQUxURVIgVEFCTEUgbWF5IGhhdmUgc3VjY2VlZGVkIGRlc3BpdGUgZXJyb3IgcmVzcG9uc2UuIFZlcmlmeWluZy4uLmApO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICAvLyBFeHRyYWN0IHRhYmxlIG5hbWUgYW5kIGNvbHVtbiBmcm9tIEFMVEVSIHN0YXRlbWVudFxuICAgICAgICAgICAgY29uc3QgYWx0ZXJNYXRjaCA9IHN0YXRlbWVudC5tYXRjaCgvQUxURVJcXHMrVEFCTEVcXHMrKFxcdyspXFxzK0FERFxccytDT0xVTU5cXHMrKElGXFxzK05PVFxccytFWElTVFNcXHMrKT8oXFx3KykvaSk7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGlmIChhbHRlck1hdGNoKSB7XG4gICAgICAgICAgICAgIGNvbnN0IHRhYmxlTmFtZSA9IGFsdGVyTWF0Y2hbMV07XG4gICAgICAgICAgICAgIGNvbnN0IGNvbHVtbk5hbWUgPSBhbHRlck1hdGNoWzNdO1xuICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAvLyBDaGVjayBpZiB0aGUgY29sdW1uIGV4aXN0c1xuICAgICAgICAgICAgICAgIGNvbnN0IGNoZWNrUmVzdWx0ID0gYXdhaXQgZXhlY3V0ZVNxbChcbiAgICAgICAgICAgICAgICAgIGNsdXN0ZXJBcm4sXG4gICAgICAgICAgICAgICAgICBzZWNyZXRBcm4sXG4gICAgICAgICAgICAgICAgICBkYXRhYmFzZSxcbiAgICAgICAgICAgICAgICAgIGBTRUxFQ1QgY29sdW1uX25hbWUgRlJPTSBpbmZvcm1hdGlvbl9zY2hlbWEuY29sdW1ucyBcbiAgICAgICAgICAgICAgICAgICBXSEVSRSB0YWJsZV9zY2hlbWEgPSAncHVibGljJyBcbiAgICAgICAgICAgICAgICAgICBBTkQgdGFibGVfbmFtZSA9ICcke3RhYmxlTmFtZX0nIFxuICAgICAgICAgICAgICAgICAgIEFORCBjb2x1bW5fbmFtZSA9ICcke2NvbHVtbk5hbWV9J2BcbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIGlmIChjaGVja1Jlc3VsdC5yZWNvcmRzICYmIGNoZWNrUmVzdWx0LnJlY29yZHMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICAgICAgY29uc29sZS5sb2coYOKchSBDb2x1bW4gJHtjb2x1bW5OYW1lfSBleGlzdHMgaW4gdGFibGUgJHt0YWJsZU5hbWV9IC0gQUxURVIgc3VjY2VlZGVkYCk7XG4gICAgICAgICAgICAgICAgICAvLyBDb2x1bW4gZXhpc3RzLCBzbyB0aGUgQUxURVIgd29ya2VkIC0gY29udGludWVcbiAgICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfSBjYXRjaCAoY2hlY2tFcnJvcikge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKGBDb3VsZCBub3QgdmVyaWZ5IGNvbHVtbiBleGlzdGVuY2U6ICR7Y2hlY2tFcnJvcn1gKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgICBcbiAgICAgICAgICAvLyBJZiB3ZSBjb3VsZG4ndCB2ZXJpZnkgc3VjY2VzcywgdGhyb3cgdGhlIG9yaWdpbmFsIGVycm9yXG4gICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cbn1cblxuYXN5bmMgZnVuY3Rpb24gZXhlY3V0ZVNxbChcbiAgY2x1c3RlckFybjogc3RyaW5nLFxuICBzZWNyZXRBcm46IHN0cmluZyxcbiAgZGF0YWJhc2U6IHN0cmluZyxcbiAgc3FsOiBzdHJpbmdcbik6IFByb21pc2U8YW55PiB7XG4gIGNvbnN0IGNvbW1hbmQgPSBuZXcgRXhlY3V0ZVN0YXRlbWVudENvbW1hbmQoe1xuICAgIHJlc291cmNlQXJuOiBjbHVzdGVyQXJuLFxuICAgIHNlY3JldEFybjogc2VjcmV0QXJuLFxuICAgIGRhdGFiYXNlOiBkYXRhYmFzZSxcbiAgICBzcWw6IHNxbCxcbiAgICBpbmNsdWRlUmVzdWx0TWV0YWRhdGE6IHRydWVcbiAgfSk7XG5cbiAgdHJ5IHtcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHJkc0NsaWVudC5zZW5kKGNvbW1hbmQpO1xuICAgIHJldHVybiByZXNwb25zZTtcbiAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgIC8vIExvZyB0aGUgZnVsbCBlcnJvciBmb3IgZGVidWdnaW5nXG4gICAgY29uc29sZS5lcnJvcihgU1FMIGV4ZWN1dGlvbiBlcnJvciBmb3Igc3RhdGVtZW50OiAke3NxbC5zdWJzdHJpbmcoMCwgMTAwKX0uLi5gKTtcbiAgICBjb25zb2xlLmVycm9yKGBFcnJvciBkZXRhaWxzOmAsIEpTT04uc3RyaW5naWZ5KGVycm9yLCBudWxsLCAyKSk7XG4gICAgXG4gICAgLy8gQ2hlY2sgaWYgdGhpcyBpcyBhIGZhbHNlLXBvc2l0aXZlIGVycm9yIGZvciBBTFRFUiBUQUJMRVxuICAgIC8vIFJEUyBEYXRhIEFQSSBzb21ldGltZXMgcmV0dXJucyBlcnJvcnMgZm9yIHN1Y2Nlc3NmdWwgRERMIG9wZXJhdGlvbnNcbiAgICBpZiAoc3FsLnRyaW0oKS50b1VwcGVyQ2FzZSgpLnN0YXJ0c1dpdGgoJ0FMVEVSIFRBQkxFJykgJiYgXG4gICAgICAgIGVycm9yLm1lc3NhZ2UgJiYgXG4gICAgICAgIChlcnJvci5tZXNzYWdlLmluY2x1ZGVzKCdEYXRhYmFzZSByZXR1cm5lZCBTUUwgZXhjZXB0aW9uJykgfHwgXG4gICAgICAgICBlcnJvci5tZXNzYWdlLmluY2x1ZGVzKCdCYWRSZXF1ZXN0RXhjZXB0aW9uJykpKSB7XG4gICAgICBjb25zb2xlLmxvZyhg4pqg77iPICBQb3RlbnRpYWwgZmFsc2UtcG9zaXRpdmUgZXJyb3IgZm9yIEFMVEVSIFRBQkxFIC0gd2lsbCB2ZXJpZnkgaW4gY2FsbGVyYCk7XG4gICAgfVxuICAgIFxuICAgIHRocm93IGVycm9yO1xuICB9XG59XG5cbmZ1bmN0aW9uIHNwbGl0U3FsU3RhdGVtZW50cyhzcWw6IHN0cmluZyk6IHN0cmluZ1tdIHtcbiAgLy8gUmVtb3ZlIGNvbW1lbnRzXG4gIGNvbnN0IHdpdGhvdXRDb21tZW50cyA9IHNxbFxuICAgIC5zcGxpdCgnXFxuJylcbiAgICAuZmlsdGVyKGxpbmUgPT4gIWxpbmUudHJpbSgpLnN0YXJ0c1dpdGgoJy0tJykpXG4gICAgLmpvaW4oJ1xcbicpO1xuXG4gIC8vIFNwbGl0IGJ5IHNlbWljb2xvbiBidXQgaGFuZGxlIENSRUFURSBUWVBFL0ZVTkNUSU9OIGJsb2NrcyBzcGVjaWFsbHlcbiAgY29uc3Qgc3RhdGVtZW50czogc3RyaW5nW10gPSBbXTtcbiAgbGV0IGN1cnJlbnRTdGF0ZW1lbnQgPSAnJztcbiAgbGV0IGluQmxvY2sgPSBmYWxzZTtcbiAgXG4gIGNvbnN0IGxpbmVzID0gd2l0aG91dENvbW1lbnRzLnNwbGl0KCdcXG4nKTtcbiAgXG4gIGZvciAoY29uc3QgbGluZSBvZiBsaW5lcykge1xuICAgIGNvbnN0IHRyaW1tZWRMaW5lID0gbGluZS50cmltKCkudG9VcHBlckNhc2UoKTtcbiAgICBcbiAgICAvLyBDaGVjayBpZiB3ZSdyZSBlbnRlcmluZyBhIGJsb2NrIChDUkVBVEUgVFlQRSwgQ1JFQVRFIEZVTkNUSU9OLCBldGMuKVxuICAgIGlmICh0cmltbWVkTGluZS5zdGFydHNXaXRoKCdDUkVBVEUgVFlQRScpIHx8IFxuICAgICAgICB0cmltbWVkTGluZS5zdGFydHNXaXRoKCdDUkVBVEUgRlVOQ1RJT04nKSB8fFxuICAgICAgICB0cmltbWVkTGluZS5zdGFydHNXaXRoKCdDUkVBVEUgT1IgUkVQTEFDRSBGVU5DVElPTicpIHx8XG4gICAgICAgIHRyaW1tZWRMaW5lLnN0YXJ0c1dpdGgoJ0RST1AgVFlQRScpKSB7XG4gICAgICBpbkJsb2NrID0gdHJ1ZTtcbiAgICB9XG4gICAgXG4gICAgY3VycmVudFN0YXRlbWVudCArPSBsaW5lICsgJ1xcbic7XG4gICAgXG4gICAgLy8gQ2hlY2sgaWYgdGhpcyBsaW5lIGVuZHMgd2l0aCBhIHNlbWljb2xvblxuICAgIGlmIChsaW5lLnRyaW0oKS5lbmRzV2l0aCgnOycpKSB7XG4gICAgICAvLyBJZiB3ZSdyZSBpbiBhIGJsb2NrLCBjaGVjayBpZiB0aGlzIGlzIHRoZSBlbmRcbiAgICAgIGlmIChpbkJsb2NrICYmICh0cmltbWVkTGluZSA9PT0gJyk7JyB8fCB0cmltbWVkTGluZS5lbmRzV2l0aCgnKTsnKSB8fCB0cmltbWVkTGluZS5lbmRzV2l0aChcIicgTEFOR1VBR0UgUExQR1NRTDtcIikpKSB7XG4gICAgICAgIGluQmxvY2sgPSBmYWxzZTtcbiAgICAgIH1cbiAgICAgIFxuICAgICAgLy8gSWYgbm90IGluIGEgYmxvY2ssIHRoaXMgc3RhdGVtZW50IGlzIGNvbXBsZXRlXG4gICAgICBpZiAoIWluQmxvY2spIHtcbiAgICAgICAgc3RhdGVtZW50cy5wdXNoKGN1cnJlbnRTdGF0ZW1lbnQudHJpbSgpKTtcbiAgICAgICAgY3VycmVudFN0YXRlbWVudCA9ICcnO1xuICAgICAgfVxuICAgIH1cbiAgfVxuICBcbiAgLy8gQWRkIGFueSByZW1haW5pbmcgc3RhdGVtZW50XG4gIGlmIChjdXJyZW50U3RhdGVtZW50LnRyaW0oKSkge1xuICAgIHN0YXRlbWVudHMucHVzaChjdXJyZW50U3RhdGVtZW50LnRyaW0oKSk7XG4gIH1cbiAgXG4gIHJldHVybiBzdGF0ZW1lbnRzO1xufVxuXG4vLyBMb2FkIFNRTCBjb250ZW50IGZyb20gYnVuZGxlZCBzY2hlbWEgZmlsZXNcbmFzeW5jIGZ1bmN0aW9uIGdldFNxbENvbnRlbnQoZmlsZW5hbWU6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nPiB7XG4gIGNvbnN0IGZzID0gcmVxdWlyZSgnZnMnKS5wcm9taXNlcztcbiAgY29uc3QgcGF0aCA9IHJlcXVpcmUoJ3BhdGgnKTtcbiAgXG4gIHRyeSB7XG4gICAgLy8gU2NoZW1hIGZpbGVzIGFyZSBjb3BpZWQgdG8gdGhlIExhbWJkYSBkZXBsb3ltZW50IHBhY2thZ2VcbiAgICBjb25zdCBzY2hlbWFQYXRoID0gcGF0aC5qb2luKF9fZGlybmFtZSwgJ3NjaGVtYScsIGZpbGVuYW1lKTtcbiAgICBjb25zdCBjb250ZW50ID0gYXdhaXQgZnMucmVhZEZpbGUoc2NoZW1hUGF0aCwgJ3V0ZjgnKTtcbiAgICByZXR1cm4gY29udGVudDtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKGBGYWlsZWQgdG8gcmVhZCBTUUwgZmlsZSAke2ZpbGVuYW1lfTpgLCBlcnJvcik7XG4gICAgdGhyb3cgbmV3IEVycm9yKGBDb3VsZCBub3QgbG9hZCBTUUwgZmlsZTogJHtmaWxlbmFtZX1gKTtcbiAgfVxufVxuXG4iXX0=