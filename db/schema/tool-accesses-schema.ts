import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"
import { toolsTable } from "./tools-schema"
import { relations } from "drizzle-orm"

export const toolAccessesTable = pgTable("tool_accesses", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id").notNull(),
  toolId: text("tool_id")
    .references(() => toolsTable.id, { onDelete: "cascade" })
    .notNull(),
  metadata: text("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date())
})

export type InsertToolAccess = typeof toolAccessesTable.$inferInsert
export type SelectToolAccess = typeof toolAccessesTable.$inferSelect

export const toolAccessesRelations = relations(toolAccessesTable, ({ one }) => ({
  tool: one(toolsTable, {
    fields: [toolAccessesTable.toolId],
    references: [toolsTable.id]
  })
})) 