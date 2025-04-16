import { boolean, integer, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"
import { aiModelsTable } from "./core-schema"
import { relations } from "drizzle-orm"

// Import related tables needed for relations
import { analysisPromptsTable, analysisResultsTable, audienceConfigsTable } from './communication-analysis-schema'

export const minimumRoleEnum = pgEnum("minimum_role", ["administrator", "staff", "student"])

export const communicationSettingsTable = pgTable("communication_settings", {
  id: uuid("id").defaultRandom().primaryKey(),
  minimumRole: minimumRoleEnum("minimum_role").notNull().default("administrator"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date())
})

export const audiencesTable = pgTable("communication_audiences", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date())
})

// Add audiencesRelations
export const audiencesRelations = relations(audiencesTable, ({ many }) => ({
  analysisPrompts: many(analysisPromptsTable),
  analysisResults: many(analysisResultsTable),
  audienceConfigs: many(audienceConfigsTable)
}));

export const accessControlTable = pgTable("communication_access_control", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id").notNull(),
  accessLevel: minimumRoleEnum("access_level").notNull().default("administrator"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date())
})

export type InsertAudience = typeof audiencesTable.$inferInsert
export type SelectAudience = typeof audiencesTable.$inferSelect
export type InsertAccessControl = typeof accessControlTable.$inferInsert
export type SelectAccessControl = typeof accessControlTable.$inferSelect
export type InsertCommunicationSettings = typeof communicationSettingsTable.$inferInsert
export type SelectCommunicationSettings = typeof communicationSettingsTable.$inferSelect 