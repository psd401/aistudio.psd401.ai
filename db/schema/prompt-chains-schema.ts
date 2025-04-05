import {
  boolean,
  integer,
  json,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid
} from "drizzle-orm/pg-core"
import { aiModelsTable } from "./core-schema"
import { relations } from "drizzle-orm"

// Enums
export const fieldTypeEnum = pgEnum("field_type", [
  "short_text",
  "long_text",
  "select",
  "multi_select"
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

// Tables
export const promptChainToolsTable = pgTable("prompt_chain_tools", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  creatorId: text("creator_id").notNull(),
  status: toolStatusEnum("status").default("draft").notNull(),
  isParallel: boolean("is_parallel").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date())
})

export const toolInputFieldsTable = pgTable("tool_input_fields", {
  id: uuid("id").defaultRandom().primaryKey(),
  toolId: uuid("tool_id")
    .references(() => promptChainToolsTable.id, { onDelete: "cascade" })
    .notNull(),
  name: text("name").notNull(),
  fieldType: fieldTypeEnum("field_type").notNull(),
  options: json("options").$type<{ label: string; value: string }[]>(),
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
    .references(() => promptChainToolsTable.id, { onDelete: "cascade" })
    .notNull(),
  name: text("name").notNull(),
  content: text("content").notNull(),
  systemContext: text("system_context"),
  modelId: integer("model_id")
    .references(() => aiModelsTable.id, { onDelete: "set null" }),
  position: integer("position").notNull(),
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
    .references(() => promptChainToolsTable.id, { onDelete: "cascade" })
    .notNull(),
  editorId: text("editor_id").notNull(),
  changes: json("changes").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull()
})

export const toolExecutionsTable = pgTable("tool_executions", {
  id: uuid("id").defaultRandom().primaryKey(),
  toolId: uuid("tool_id")
    .references(() => promptChainToolsTable.id, { onDelete: "cascade" })
    .notNull(),
  userId: text("user_id").notNull(),
  inputData: json("input_data").notNull(),
  status: executionStatusEnum("status").notNull().default("pending"),
  errorMessage: text("error_message"),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at")
})

export const promptResultsTable = pgTable("prompt_results", {
  id: uuid("id").defaultRandom().primaryKey(),
  executionId: uuid("execution_id")
    .references(() => toolExecutionsTable.id, { onDelete: "cascade" })
    .notNull(),
  promptId: uuid("prompt_id")
    .references(() => chainPromptsTable.id, { onDelete: "cascade" })
    .notNull(),
  inputData: json("input_data").notNull(),
  outputData: text("output_data"),
  status: executionStatusEnum("status").notNull().default("pending"),
  errorMessage: text("error_message"),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
  executionTimeMs: integer("execution_time_ms")
})

// Relations
export const promptChainToolsRelations = relations(promptChainToolsTable, ({ many }) => ({
  inputFields: many(toolInputFieldsTable),
  prompts: many(chainPromptsTable),
  executions: many(toolExecutionsTable),
  edits: many(toolEditsTable)
}))

export const toolInputFieldsRelations = relations(toolInputFieldsTable, ({ one }) => ({
  tool: one(promptChainToolsTable, {
    fields: [toolInputFieldsTable.toolId],
    references: [promptChainToolsTable.id]
  })
}))

export const chainPromptsRelations = relations(chainPromptsTable, ({ one, many }) => ({
  tool: one(promptChainToolsTable, {
    fields: [chainPromptsTable.toolId],
    references: [promptChainToolsTable.id]
  }),
  model: one(aiModelsTable, {
    fields: [chainPromptsTable.modelId],
    references: [aiModelsTable.id]
  }),
  results: many(promptResultsTable)
}))

export const toolExecutionsRelations = relations(toolExecutionsTable, ({ one, many }) => ({
  tool: one(promptChainToolsTable, {
    fields: [toolExecutionsTable.toolId],
    references: [promptChainToolsTable.id]
  }),
  results: many(promptResultsTable)
}))

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
export type InsertPromptChainTool = typeof promptChainToolsTable.$inferInsert
export type SelectPromptChainTool = typeof promptChainToolsTable.$inferSelect

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