import { pgTable, serial, integer, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { usersTable } from './core-schema';
import { rolesTable } from './roles-schema';

export const userRolesTable = pgTable('user_roles', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => usersTable.id, { onDelete: 'cascade' })
    .notNull(),
  roleId: integer('role_id')
    .references(() => rolesTable.id, { onDelete: 'cascade' })
    .notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull()
}, (table) => {
  return {
    unq: uniqueIndex('user_role_unq_idx').on(table.userId, table.roleId)
  };
});

export type InsertUserRole = typeof userRolesTable.$inferInsert;
export type SelectUserRole = typeof userRolesTable.$inferSelect; 