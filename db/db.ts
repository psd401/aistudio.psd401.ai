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
 */

import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import * as schema from "./schema"

if (!process.env.DATABASE_URL) {
  throw new Error("Missing env.DATABASE_URL")
}

// Singleton connection for better performance
const client = postgres(process.env.DATABASE_URL)

// Export db with complete schema
export const db = drizzle(client, { schema }) 