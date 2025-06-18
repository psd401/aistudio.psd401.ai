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
import {
  // Core
  aiModelsTable,
  usersTable,
  ideasTable,
  ideaNotesTable,
  ideaVotesTable,
  conversationsTable,
  messagesTable,
  // Roles
  rolesTable,
  userRolesTable,
  roleToolsTable,
  // Assistant Architect
  assistantArchitectsTable,
  toolInputFieldsTable,
  chainPromptsTable,
  toolExecutionsTable,
  promptResultsTable,
  // toolEditsTable, // Assuming toolEdits doesn't exist or relations aren't defined
  // Tools
  toolsTable,
  toolAccessesTable,
  // Navigation
  navigationItemsTable,
  jobsTable,
  // Documents
  documentsTable,
  documentChunksTable,

  // -- RELATIONS (Import only those confirmed defined) --
  aiModelsRelations,
  conversationsRelations,
  messagesRelations,
  rolesRelations,
  userRolesRelations,
  roleToolsRelations,
  assistantArchitectsRelations,
  toolInputFieldsRelations,
  chainPromptsRelations,
  toolExecutionsRelations,
  promptResultsRelations,
  // toolEditsRelations, // Removed
  toolsRelations,
  toolAccessesRelations,
  navigationItemsRelations,
  // communicationRelations, // Removed
  // audienceAnalysisRelations, // Removed
  // metaPromptingTechniquesRelations, // Removed
  // metaPromptingTemplatesRelations, // Removed
  // politicalWordingPromptsRelations, // Removed
  // politicalWordingContextsRelations, // Removed
} from "@/db/schema"

/**
 * Database configuration using Drizzle ORM.
 * 
 * Schema includes:
 * - Base system tables (tools, roles, etc.)
 * - Prompt chain related tables
 * - Navigation and role assignment tables
 * 
 * Note: When adding new tables, make sure to include them in the schema object below.
 * 
 * Connection Options:
 * - RDS Proxy: Use for production, provides connection pooling and IAM auth
 * - Cluster Endpoint: Direct connection to primary instance, good for development
 * - Format: postgresql://username:password@host:port/database?sslmode=require
 */

/**
 * Cache the database connection in development. This avoids creating a new connection on every HMR update.
 */
const globalForDb = globalThis as unknown as {
  conn: postgres.Sql | undefined
}

const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  throw new Error(
    'DATABASE_URL environment variable is not set. Please check your .env.local file.'
  )
}

// Parse the connection string to check if we're using RDS
const isRdsConnection = connectionString.includes('rds.amazonaws.com')

const conn = globalForDb.conn ?? postgres(connectionString, {
  connect_timeout: isRdsConnection ? 30 : 10,  // Longer timeout for RDS
  idle_timeout: 20,
  max_lifetime: 60 * 30,
  max: 10,                  // Maximum number of connections
  // SSL configuration for RDS
  ssl: isRdsConnection ? { rejectUnauthorized: false } : false,
  prepare: false,           // Disable prepared statements for better compatibility
})
if (process.env.NODE_ENV !== "production") globalForDb.conn = conn

// Define the schema object ONLY with imported tables
const schema = {
  // Core
  aiModels: aiModelsTable,
  users: usersTable,
  ideas: ideasTable,
  ideaNotes: ideaNotesTable,
  ideaVotes: ideaVotesTable,
  conversations: conversationsTable,
  messages: messagesTable,
  // Roles
  roles: rolesTable,
  userRoles: userRolesTable,
  roleTools: roleToolsTable,
  // Assistant Architect
  assistantArchitects: assistantArchitectsTable,
  toolInputFields: toolInputFieldsTable,
  chainPrompts: chainPromptsTable,
  toolExecutions: toolExecutionsTable,
  promptResults: promptResultsTable,
  // toolEdits: toolEditsTable,
  // Tools
  tools: toolsTable,
  toolAccesses: toolAccessesTable,
  // Navigation
  navigationItems: navigationItemsTable,
  jobs: jobsTable,
  // Documents
  documents: documentsTable,
  documentChunks: documentChunksTable,
  
  // --- RELATIONS --- 
  // Include relations only if they were successfully imported above
  aiModelsRelations,
  conversationsRelations,
  messagesRelations,
  rolesRelations,
  userRolesRelations,
  roleToolsRelations,
  assistantArchitectsRelations,
  toolInputFieldsRelations,
  chainPromptsRelations,
  toolExecutionsRelations,
  promptResultsRelations,
  // toolEditsRelations,
  toolsRelations,
  toolAccessesRelations,
  navigationItemsRelations,
  // communicationRelations,
  // audienceAnalysisRelations,
  // metaPromptingTechniquesRelations,
  // metaPromptingTemplatesRelations,
  // politicalWordingPromptsRelations,
  // politicalWordingContextsRelations,
}

// Query logging is controlled by DB_LOG_QUERIES env variable. Set DB_LOG_QUERIES=true in .env.local to enable query logs in dev.
export const db = drizzle(conn, {
  schema: schema,
  logger: process.env.DB_LOG_QUERIES === 'true'
}) 