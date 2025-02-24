import { boolean, pgEnum, pgTable, text, timestamp, uuid, integer } from "drizzle-orm/pg-core"
import { aiModelsTable } from "./core-schema"

// Enum for different stages of analysis
export const politicalStageEnum = pgEnum("political_stage", [
  "initial",
  "context",
  "synthesis"
])

// Table for storing analysis contexts
export const politicalContextsTable = pgTable("political_contexts", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date())
})

// Table for storing analysis prompts
export const politicalPromptsTable = pgTable("political_prompts", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  content: text("content").notNull(),
  stage: politicalStageEnum("stage").notNull(),
  modelId: integer("model_id").references(() => aiModelsTable.id, { onDelete: "cascade" }),
  contextId: uuid("context_id").references(() => politicalContextsTable.id, { onDelete: "cascade" }),
  usesLatimer: boolean("uses_latimer").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date())
})

// Table for storing settings
export const politicalSettingsTable = pgTable("political_settings", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  value: text("value").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date())
})

// Types for database operations
export type InsertPoliticalContext = typeof politicalContextsTable.$inferInsert
export type SelectPoliticalContext = typeof politicalContextsTable.$inferSelect

export type InsertPoliticalPrompt = typeof politicalPromptsTable.$inferInsert
export type SelectPoliticalPrompt = typeof politicalPromptsTable.$inferSelect

export type InsertPoliticalSetting = typeof politicalSettingsTable.$inferInsert
export type SelectPoliticalSetting = typeof politicalSettingsTable.$inferSelect 