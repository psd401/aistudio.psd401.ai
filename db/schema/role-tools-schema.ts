import { pgTable, text, timestamp } from "drizzle-orm/pg-core"
import { relations } from "drizzle-orm"
import { rolesTable } from "./roles-schema"
import { toolsTable } from "./tools-schema"

export const roleToolsTable = pgTable("role_tools", {
  roleId: text("role_id")
    .references(() => rolesTable.id, { onDelete: "cascade" })
    .notNull(),
  toolId: text("tool_id")
    .references(() => toolsTable.id, { onDelete: "cascade" })
    .notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date())
})

export const roleToolsRelations = relations(roleToolsTable, ({ one }) => ({
  role: one(rolesTable, {
    fields: [roleToolsTable.roleId],
    references: [rolesTable.id],
  }),
  tool: one(toolsTable, {
    fields: [roleToolsTable.toolId],
    references: [toolsTable.id],
  }),
}))

export type InsertRoleTool = typeof roleToolsTable.$inferInsert
export type SelectRoleTool = typeof roleToolsTable.$inferSelect 