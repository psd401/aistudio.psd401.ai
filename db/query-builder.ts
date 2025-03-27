import { pgTable } from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/postgres-js';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import postgres from 'postgres';
import * as schema from './schema';

// Import all tables and their relations
import {
  promptChainToolsTable,
  promptChainToolsRelations,
  toolInputFieldsTable,
  toolInputFieldsRelations,
  chainPromptsTable,
  chainPromptsRelations,
  toolExecutionsTable,
  toolExecutionsRelations,
  promptResultsTable,
  promptResultsRelations
} from './schema/prompt-chains-schema';

if (!process.env.DATABASE_URL) {
  throw new Error("Missing env.DATABASE_URL")
}

// Create the database connection
const client = postgres(process.env.DATABASE_URL, {
  prepare: true,
  max: 10
});

// Create the enhanced database instance with query builder
export const db = drizzle(client, {
  schema: {
    ...schema,
    promptChainTools: {
      table: promptChainToolsTable,
      relations: promptChainToolsRelations
    },
    toolInputFields: {
      table: toolInputFieldsTable,
      relations: toolInputFieldsRelations
    },
    chainPrompts: {
      table: chainPromptsTable,
      relations: chainPromptsRelations
    },
    toolExecutions: {
      table: toolExecutionsTable,
      relations: toolExecutionsRelations
    },
    promptResults: {
      table: promptResultsTable,
      relations: promptResultsRelations
    }
  }
}); 