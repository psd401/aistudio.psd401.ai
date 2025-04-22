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
  // Communication
  communicationSettingsTable,
  audiencesTable,
  accessControlTable,
  // Communication Analysis
  analysisPromptsTable,
  analysisResultsTable,
  audienceConfigsTable,
  // Meta Prompting
  metaPromptingTechniquesTable,
  metaPromptingTemplatesTable,
  // Navigation
  navigationItemsTable,
  jobsTable,

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
  audiencesRelations,
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
 */

/**
 * Cache the database connection in development. This avoids creating a new connection on every HMR update.
 */
const globalForDb = globalThis as unknown as {
  conn: postgres.Sql | undefined
}

const connectionString = process.env.DATABASE_URL!
const conn = globalForDb.conn ?? postgres(connectionString)
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
  // Communication
  communicationSettings: communicationSettingsTable,
  audiences: audiencesTable,
  accessControl: accessControlTable,
   // Communication Analysis
  analysisPrompts: analysisPromptsTable,
  analysisResults: analysisResultsTable,
  audienceConfigs: audienceConfigsTable,
  // Meta Prompting
  metaPromptingTechniques: metaPromptingTechniquesTable,
  metaPromptingTemplates: metaPromptingTemplatesTable,
  // Navigation
  navigationItems: navigationItemsTable,
  jobs: jobsTable,
  
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
  audiencesRelations,
  navigationItemsRelations,
  // communicationRelations,
  // audienceAnalysisRelations,
  // metaPromptingTechniquesRelations,
  // metaPromptingTemplatesRelations,
  // politicalWordingPromptsRelations,
  // politicalWordingContextsRelations,
}

export const db = drizzle(conn, {
  schema: schema,
  logger: process.env.NODE_ENV === 'development'
}) 