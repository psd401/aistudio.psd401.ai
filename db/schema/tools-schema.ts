import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core"

export const toolsTable = pgTable("tools", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date())
})

export type InsertTool = typeof toolsTable.$inferInsert
export type SelectTool = typeof toolsTable.$inferSelect 