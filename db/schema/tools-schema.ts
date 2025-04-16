import { boolean, pgTable, text, timestamp, uuid, integer } from "drizzle-orm/pg-core"
import { assistantArchitectsTable } from "./assistant-architects-schema"
import { relations } from "drizzle-orm"

/**
 * Base tools table that represents all available tools in the system.
 * This includes both system tools and approved prompt chain tools.
 * 
 * When an Assistant Architect tool is approved, it gets an entry in this table
 * with a reference back to the original Assistant Architect via assistantArchitectId.
 */
export const toolsTable = pgTable("tools", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  // Reference to the original Assistant Architect if this tool was created from one
  assistantArchitectId: uuid("prompt_chain_tool_id").references(() => assistantArchitectsTable.id, { onDelete: "cascade" }).unique(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date())
})

/**
 * Defines the relationship between tools and their source Assistant Architect.
 */
export const toolsRelations = relations(toolsTable, ({ one, many }) => ({
  assistantArchitect: one(assistantArchitectsTable, {
    fields: [toolsTable.assistantArchitectId],
    references: [assistantArchitectsTable.id]
  })
}))

export type InsertTool = typeof toolsTable.$inferInsert
export type SelectTool = typeof toolsTable.$inferSelect 