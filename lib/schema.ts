import { pgTable, serial, varchar, timestamp, text, integer } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  clerkId: varchar('clerk_id', { length: 255 }).notNull().unique(),
  role: varchar('role', { length: 50 }).notNull().default('Staff'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const ideas = pgTable("ideas", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  priorityLevel: text("priority_level").notNull(),
  status: text("status").notNull().default("active"),
  votes: integer("votes").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  createdBy: text("created_by").notNull(),
  completedAt: timestamp("completed_at"),
  completedBy: text("completed_by"),
});

export const ideaNotes = pgTable("idea_notes", {
  id: serial("id").primaryKey(),
  ideaId: integer("idea_id")
    .notNull()
    .references(() => ideas.id),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  createdBy: text("created_by").notNull(),
});

export const ideaVotes = pgTable("idea_votes", {
  id: serial("id").primaryKey(),
  ideaId: integer("idea_id")
    .notNull()
    .references(() => ideas.id),
  userId: text("user_id").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Idea = typeof ideas.$inferSelect;
export type NewIdea = typeof ideas.$inferInsert;

export type IdeaNote = typeof ideaNotes.$inferSelect;
export type NewIdeaNote = typeof ideaNotes.$inferInsert;

export type IdeaVote = typeof ideaVotes.$inferSelect;
export type NewIdeaVote = typeof ideaVotes.$inferInsert; 