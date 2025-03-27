/**
 * Central database connection for the application
 * 
 * This is the main entry point for all database operations.
 * Import this file to get access to the database client.
 * 
 * Example:
 * ```ts
 * import { db } from "@/db/db"
 * ```
 * 
 * NOTE: For server actions, especially those requiring Clerk auth,
 * it's strongly recommended to use @/db/query instead, which includes
 * proper configuration for relationships required by auth functions.
 */

import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import * as schema from "@/db/schema"

/**
 * Database configuration using Drizzle ORM.
 * 
 * Schema includes:
 * - Base system tables (tools, roles, etc.)
 * - Prompt chain related tables
 * - Navigation and role assignment tables
 * 
 * Note: When adding new tables, make sure to include them in the schema object below.
 */

const connectionString = process.env.DATABASE_URL!
const client = postgres(connectionString)

export const db = drizzle(client, {
  schema: {
    // Base system tables
    tools: schema.toolsTable,
    roles: schema.rolesTable,
    roleTools: schema.roleToolsTable,
    navigationItems: schema.navigationItemsTable,
    
    // Prompt chain related tables
    promptChainTools: schema.promptChainToolsTable,
    toolInputFields: schema.toolInputFieldsTable,
    chainPrompts: schema.chainPromptsTable,
    toolEdits: schema.toolEditsTable,
    toolExecutions: schema.toolExecutionsTable,
    promptResults: schema.promptResultsTable,
    
    // AI models
    aiModels: schema.aiModelsTable
  }
}) 