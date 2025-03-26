import { pgTable, text, integer, boolean, timestamp } from "drizzle-orm/pg-core"
import { toolsTable } from "./tools-schema"

export const navigationItemsTable = pgTable("navigation_items", {
  id: text("id").primaryKey(),
  label: text("label").notNull(),
  icon: text("icon").notNull(),
  link: text("link"),
  parentId: text("parent_id").references(() => navigationItemsTable.id, { onDelete: "cascade" }),
  toolId: text("tool_id").references(() => toolsTable.id),
  requiresRole: text("requires_role"),
  position: integer("position").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull()
})

export type InsertNavigationItem = typeof navigationItemsTable.$inferInsert
export type SelectNavigationItem = typeof navigationItemsTable.$inferSelect 