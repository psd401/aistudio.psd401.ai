import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core"
import { relations } from "drizzle-orm"
import { userRolesTable } from "./user-roles-schema"
import { roleToolsTable } from "./role-tools-schema"

export const rolesTable = pgTable("roles", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  isSystem: boolean("is_system").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date())
})

export const rolesRelations = relations(rolesTable, ({ many }) => ({
  userRoles: many(userRolesTable),
  roleTools: many(roleToolsTable)
}));

export type InsertRole = typeof rolesTable.$inferInsert
export type SelectRole = typeof rolesTable.$inferSelect 