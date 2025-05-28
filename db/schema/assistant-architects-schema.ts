import {
  boolean,
  integer,
  json,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
  smallint
} from "drizzle-orm/pg-core"
import { aiModelsTable } from "./core-schema"
import { relations } from "drizzle-orm"
import { users } from "@clerk/nextjs/api" // Assuming users table for creator

// Enums
export const fieldTypeEnum = pgEnum("field_type", [
  "short_text",
  "long_text",
  "select",
  "multi_select",
  "file_upload"
])

export const executionStatusEnum = pgEnum("execution_status", [
  "pending",
  "running",
  "completed",
  "failed"
])

export const toolStatusEnum = pgEnum("tool_status", [
  "draft",
  "pending_approval",
  "approved",
  "rejected",
  "disabled"
])

export const inputFieldTypeEnum = pgEnum("input_field_type", [
  "text",
  "textarea",
  "select"
])

export const promptTypeEnum = pgEnum("prompt_type", ["system", "user"])

export const promptResultStatusEnum = pgEnum("prompt_result_status", [
  "pending",
  "completed",
  "failed"
])

// Tables
export const assistantArchitectsTable = pgTable("assistant_architects", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  imagePath: text("image_path"),
  creatorId: text("creator_id").notNull(),
  status: toolStatusEnum("status").default("draft").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date())
})

export const toolInputFieldsTable = pgTable("tool_input_fields", {
  id: uuid("id").defaultRandom().primaryKey(),
  toolId: uuid("tool_id")
    .references(() => assistantArchitectsTable.id, { onDelete: "cascade" })
    .notNull(),
  name: text("name").notNull(),
  fieldType: fieldTypeEnum("field_type").notNull(),
  options: jsonb("options"),
  position: integer("position").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date())
})

export const chainPromptsTable = pgTable("chain_prompts", {
  id: uuid("id").defaultRandom().primaryKey(),
  toolId: uuid("tool_id")
    .references(() => assistantArchitectsTable.id, { onDelete: "cascade" })
    .notNull(),
  name: text("name").notNull(),
  content: text("content").notNull(),
  systemContext: text("system_context"),
  modelId: integer("model_id"),
  position: integer("position").default(0).notNull(),
  inputMapping: jsonb("input_mapping"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date())
})

export const toolEditsTable = pgTable("tool_edits", {
  id: uuid("id").defaultRandom().primaryKey(),
  toolId: uuid("tool_id")
    .references(() => assistantArchitectsTable.id, { onDelete: "cascade" })
    .notNull(),
  editorId: text("editor_id").notNull(),
  changes: json("changes").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull()
})

export const toolExecutionsTable = pgTable("tool_executions", {
  id: uuid("id").defaultRandom().primaryKey(),
  toolId: uuid("tool_id")
    .references(() => assistantArchitectsTable.id, { onDelete: "cascade" })
    .notNull(),
  userId: text("user_id").notNull(),
  inputData: jsonb("input_data").notNull(),
  status: executionStatusEnum("status").notNull().default("pending"),
  errorMessage: text("error_message"),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
})

export const promptResultsTable = pgTable("prompt_results", {
  id: uuid("id").defaultRandom().primaryKey(),
  executionId: uuid("execution_id")
    .references(() => toolExecutionsTable.id, { onDelete: "cascade" })
    .notNull(),
  promptId: uuid("prompt_id")
    .references(() => chainPromptsTable.id, { onDelete: "cascade" })
    .notNull(),
  inputData: jsonb("input_data").notNull(),
  outputData: text("output_data"),
  status: promptResultStatusEnum("status").default("pending").notNull(),
  errorMessage: text("error_message"),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
  executionTimeMs: integer("execution_time_ms"),
})

// Relations
export const assistantArchitectsRelations = relations(assistantArchitectsTable, ({ many }) => ({
  inputFields: many(toolInputFieldsTable, { relationName: "toolInputFields" }),
  prompts: many(chainPromptsTable, { relationName: "chainPrompts" }),
  executions: many(toolExecutionsTable, { relationName: "toolExecutions" })
}))

export const toolInputFieldsRelations = relations(toolInputFieldsTable, ({ one }) => ({
  tool: one(assistantArchitectsTable, {
    fields: [toolInputFieldsTable.toolId],
    references: [assistantArchitectsTable.id],
    relationName: "toolInputFields"
  })
}))

export const chainPromptsRelations = relations(chainPromptsTable, ({ one, many }) => ({
  tool: one(assistantArchitectsTable, {
    fields: [chainPromptsTable.toolId],
    references: [assistantArchitectsTable.id],
    relationName: "chainPrompts"
  }),
  results: many(promptResultsTable)
}))

export const toolExecutionsRelations = relations(
  toolExecutionsTable,
  ({ one, many }) => ({
    tool: one(assistantArchitectsTable, {
      fields: [toolExecutionsTable.toolId],
      references: [assistantArchitectsTable.id],
      relationName: "toolExecutions"
    }),
    promptResults: many(promptResultsTable)
  })
)

export const promptResultsRelations = relations(promptResultsTable, ({ one }) => ({
  execution: one(toolExecutionsTable, {
    fields: [promptResultsTable.executionId],
    references: [toolExecutionsTable.id]
  }),
  prompt: one(chainPromptsTable, {
    fields: [promptResultsTable.promptId],
    references: [chainPromptsTable.id]
  })
}))

// Types
export type InsertAssistantArchitect = typeof assistantArchitectsTable.$inferInsert
export type SelectAssistantArchitect = typeof assistantArchitectsTable.$inferSelect

export type InsertToolInputField = typeof toolInputFieldsTable.$inferInsert
export type SelectToolInputField = typeof toolInputFieldsTable.$inferSelect

export type InsertChainPrompt = typeof chainPromptsTable.$inferInsert
export type SelectChainPrompt = typeof chainPromptsTable.$inferSelect

export type InsertToolEdit = typeof toolEditsTable.$inferInsert
export type SelectToolEdit = typeof toolEditsTable.$inferSelect

export type InsertToolExecution = typeof toolExecutionsTable.$inferInsert
export type SelectToolExecution = typeof toolExecutionsTable.$inferSelect

export type InsertPromptResult = typeof promptResultsTable.$inferInsert
export type SelectPromptResult = typeof promptResultsTable.$inferSelect 