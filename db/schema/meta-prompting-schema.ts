import { pgTable, text, timestamp, uuid, jsonb, pgEnum, integer } from "drizzle-orm/pg-core"
import { aiModelsTable } from "./core-schema"

export const techniqueTypeEnum = pgEnum("technique_type", [
  "prompt_generation",
  "iterative_refinement", 
  "feedback",
  "role_reversal",
  "bot_to_bot",
  "meta_questioning"
])

export const metaPromptingTechniquesTable = pgTable("meta_prompting_techniques", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  type: techniqueTypeEnum("type").notNull(),
  example: text("example").notNull(),
  exampleInput: text("example_input"),
  exampleOutput: text("example_output"),
  modelId: integer("model_id").references(() => aiModelsTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date())
})

export const metaPromptingTemplatesTable = pgTable("meta_prompting_templates", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  techniqueId: uuid("technique_id")
    .references(() => metaPromptingTechniquesTable.id, { onDelete: "cascade" })
    .notNull(),
  template: text("template").notNull(),
  variables: jsonb("variables"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date())
})

export type InsertMetaPromptingTechnique = typeof metaPromptingTechniquesTable.$inferInsert
export type SelectMetaPromptingTechnique = typeof metaPromptingTechniquesTable.$inferSelect
export type InsertMetaPromptingTemplate = typeof metaPromptingTemplatesTable.$inferInsert
export type SelectMetaPromptingTemplate = typeof metaPromptingTemplatesTable.$inferSelect 