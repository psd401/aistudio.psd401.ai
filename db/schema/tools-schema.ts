import { boolean, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"
import { relations } from "drizzle-orm"
import { promptChainToolsTable } from "./prompt-chains-schema"

/**
 * Base tools table that represents all available tools in the system.
 * This includes both system tools and approved prompt chain tools.
 * 
 * When a prompt chain tool is approved, it gets an entry in this table
 * with a reference back to the original prompt chain tool via promptChainToolId.
 */
export const toolsTable = pgTable("tools", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  // Reference to the original prompt chain tool if this tool was created from one
  promptChainToolId: uuid("prompt_chain_tool_id").references(() => promptChainToolsTable.id, { onDelete: "cascade" }).unique(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date())
})

/**
 * Defines the relationship between tools and their source prompt chain tools.
 * This allows us to track which tools were created from approved prompt chains.
 */
export const toolsRelations = relations(toolsTable, ({ one }) => ({
  promptChainTool: one(promptChainToolsTable, {
    fields: [toolsTable.promptChainToolId],
    references: [promptChainToolsTable.id]
  })
}))

export type InsertTool = typeof toolsTable.$inferInsert
export type SelectTool = typeof toolsTable.$inferSelect 