import { boolean, integer, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"
import { aiModelsTable } from "./core-schema"

export const minimumRoleEnum = pgEnum("minimum_role", ["administrator", "staff", "student"])

export const communicationSettingsTable = pgTable("communication_settings", {
  id: uuid("id").defaultRandom().primaryKey(),
  minimumRole: minimumRoleEnum("minimum_role").notNull().default("administrator"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date())
})

export const audiencesTable = pgTable("communication_audiences", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date())
})

export const analysisPromptsTable = pgTable("communication_analysis_prompts", {
  id: uuid("id").defaultRandom().primaryKey(),
  audienceId: uuid("audience_id").references(() => audiencesTable.id, { onDelete: "cascade" }),
  modelId: integer("model_id").references(() => aiModelsTable.id, { onDelete: "cascade" }),
  prompt: text("prompt").notNull(),
  isMetaAnalysis: boolean("is_meta_analysis").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date())
})

export const analysisResultsTable = pgTable("communication_analysis_results", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id").notNull(),
  originalMessage: text("original_message").notNull(),
  audienceId: uuid("audience_id").references(() => audiencesTable.id, { onDelete: "cascade" }),
  feedback: text("feedback").notNull(),
  suggestedRevisions: text("suggested_revisions"),
  metaAnalysis: text("meta_analysis"),
  modelId: integer("model_id").references(() => aiModelsTable.id, { onDelete: "cascade" }),
  promptId: uuid("prompt_id").references(() => analysisPromptsTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date())
})

export const accessControlTable = pgTable("communication_access_control", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id").notNull(),
  accessLevel: minimumRoleEnum("access_level").notNull().default("restricted"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date())
})

export type InsertAudience = typeof audiencesTable.$inferInsert
export type SelectAudience = typeof audiencesTable.$inferSelect
export type InsertAnalysisPrompt = typeof analysisPromptsTable.$inferInsert
export type SelectAnalysisPrompt = typeof analysisPromptsTable.$inferSelect
export type InsertAnalysisResult = typeof analysisResultsTable.$inferInsert
export type SelectAnalysisResult = typeof analysisResultsTable.$inferSelect
export type InsertAccessControl = typeof accessControlTable.$inferInsert
export type SelectAccessControl = typeof accessControlTable.$inferSelect
export type InsertCommunicationSettings = typeof communicationSettingsTable.$inferInsert
export type SelectCommunicationSettings = typeof communicationSettingsTable.$inferSelect 