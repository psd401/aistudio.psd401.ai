import { pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { usersTable } from './core-schema';
import { rolesTable } from './roles-schema';
import { relations } from "drizzle-orm";

export const userRolesTable = pgTable('user_roles', {
  userId: text('user_id')
    .references(() => usersTable.id, { onDelete: 'cascade' })
    .notNull(),
  roleId: text('role_id')
    .references(() => rolesTable.id, { onDelete: 'cascade' })
    .notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull()
}, (table) => {
  return {
    unq: uniqueIndex('user_role_unq_idx').on(table.userId, table.roleId)
  };
});

export const userRolesRelations = relations(userRolesTable, ({ one }) => ({
  user: one(usersTable, {
    fields: [userRolesTable.userId],
    references: [usersTable.id]
  }),
  role: one(rolesTable, {
    fields: [userRolesTable.roleId],
    references: [rolesTable.id]
  })
}));

export type InsertUserRole = typeof userRolesTable.$inferInsert;
export type SelectUserRole = typeof userRolesTable.$inferSelect; 