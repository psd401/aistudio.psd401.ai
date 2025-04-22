import { pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"

export const jobStatusEnum = pgEnum("job_status", ["pending", "running", "completed", "failed"])

export const jobsTable = pgTable("jobs", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id").notNull(),
  status: jobStatusEnum("status").notNull().default("pending"),
  type: text("type").notNull(),
  input: text("input").notNull(),
  output: text("output"),
  error: text("error"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date())
})

export type InsertJob = typeof jobsTable.$inferInsert
export type SelectJob = typeof jobsTable.$inferSelect 