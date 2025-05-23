import { pgEnum, pgTable, text, integer, boolean, timestamp } from "drizzle-orm/pg-core"
import { toolsTable } from "./tools-schema"
import { relations } from "drizzle-orm"

export const navigationTypeEnum = pgEnum("navigation_type", ["link", "section", "page"])

export const navigationItemsTable = pgTable("navigation_items", {
  id: text("id").primaryKey(),
  label: text("label").notNull(),
  icon: text("icon").notNull(),
  link: text("link"),
  description: text("description"),
  type: navigationTypeEnum("type").notNull().default("link"),
  parentId: text("parent_id").references(() => navigationItemsTable.id, { onDelete: "cascade" }),
  toolId: text("tool_id").references(() => toolsTable.id),
  requiresRole: text("requires_role"),
  position: integer("position").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull()
})

export const navigationItemsRelations = relations(navigationItemsTable, ({ one, many }) => ({
  parent: one(navigationItemsTable, {
    fields: [navigationItemsTable.parentId],
    references: [navigationItemsTable.id],
    relationName: "children"
  }),
  children: many(navigationItemsTable, {
    relationName: "children"
  }),
  tool: one(toolsTable, {
    fields: [navigationItemsTable.toolId],
    references: [toolsTable.id]
  })
}))

// Parent/Child Rules:
// - Section: can parent links/tools and pages (not other sections)
// - Page: can parent links/tools (not other pages or sections)
// - Link/tool: can be child of section or page
// - Only links/tools that are children of sections or top-level are shown in sidebar
// - Links/tools that are children of a page are only shown on the page route

export type InsertNavigationItem = typeof navigationItemsTable.$inferInsert
export type SelectNavigationItem = typeof navigationItemsTable.$inferSelect 