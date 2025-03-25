import { boolean, pgTable, text, timestamp, uuid, integer } from "drizzle-orm/pg-core"
import { aiModelsTable } from "./core-schema"
import { audiencesTable } from "./communication-schema"

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

export const audienceConfigsTable = pgTable("communication_audience_configs", {
  id: uuid("id").defaultRandom().primaryKey(),
  audienceId: uuid("audience_id").references(() => audiencesTable.id, { onDelete: "cascade" }).notNull(),
  modelId: integer("model_id").references(() => aiModelsTable.id, { onDelete: "cascade" }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date())
})

export type InsertAnalysisPrompt = typeof analysisPromptsTable.$inferInsert
export type SelectAnalysisPrompt = typeof analysisPromptsTable.$inferSelect
export type InsertAnalysisResult = typeof analysisResultsTable.$inferInsert
export type SelectAnalysisResult = typeof analysisResultsTable.$inferSelect
export type InsertAudienceConfig = typeof audienceConfigsTable.$inferInsert
export type SelectAudienceConfig = typeof audienceConfigsTable.$inferSelect 