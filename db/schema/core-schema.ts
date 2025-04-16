import { pgTable, serial, varchar, timestamp, text, integer, boolean } from 'drizzle-orm/pg-core';
import { relations } from "drizzle-orm";

export const usersTable = pgTable('users', {
  id: serial('id').primaryKey(),
  clerkId: varchar('clerk_id', { length: 255 }).notNull().unique(),
  firstName: varchar('first_name', { length: 255 }),
  lastName: varchar('last_name', { length: 255 }),
  email: varchar('email', { length: 255 }),
  lastSignInAt: timestamp('last_sign_in_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date())
});

export const ideasTable = pgTable("ideas", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  priorityLevel: text("priority_level").notNull(),
  status: text("status").notNull().default("active"),
  votes: integer("votes").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  createdBy: text("created_by").notNull(),
  completedAt: timestamp("completed_at"),
  completedBy: text("completed_by")
});

export const ideaNotesTable = pgTable("idea_notes", {
  id: serial("id").primaryKey(),
  ideaId: integer("idea_id")
    .notNull()
    .references(() => ideasTable.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  createdBy: text("created_by").notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date())
});

export const ideaVotesTable = pgTable("idea_votes", {
  id: serial("id").primaryKey(),
  ideaId: integer("idea_id")
    .notNull()
    .references(() => ideasTable.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date())
});

export const aiModelsTable = pgTable("ai_models", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  provider: text("provider").notNull(), // 'azure', 'amazon-bedrock', or 'google'
  modelId: text("model_id").notNull(), // The actual model identifier used by the provider
  description: text("description"),
  capabilities: text("capabilities"), // JSON string of model capabilities
  maxTokens: integer("max_tokens"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date())
});

export const aiModelsRelations = relations(aiModelsTable, ({ many }) => ({
  conversations: many(conversationsTable)
}));

export const conversationsTable = pgTable("conversations", {
  id: serial("id").primaryKey(),
  clerkId: varchar("clerk_id", { length: 255 }).notNull().references(() => usersTable.clerkId),
  title: text("title").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
  modelId: integer("model_id").notNull().references(() => aiModelsTable.id)
});

export const conversationsRelations = relations(conversationsTable, ({ one, many }) => ({
  user: one(usersTable, { fields: [conversationsTable.clerkId], references: [usersTable.clerkId] }),
  model: one(aiModelsTable, { fields: [conversationsTable.modelId], references: [aiModelsTable.id] }),
  messages: many(messagesTable)
}));

export const messagesTable = pgTable("messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id")
    .notNull()
    .references(() => conversationsTable.id, { onDelete: "cascade" }),
  role: text("role").notNull(), // 'user' or 'assistant'
  content: text("content").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date())
});

export const messagesRelations = relations(messagesTable, ({ one }) => ({
  conversation: one(conversationsTable, { fields: [messagesTable.conversationId], references: [conversationsTable.id] })
}));

export type InsertUser = typeof usersTable.$inferInsert;
export type SelectUser = typeof usersTable.$inferSelect;

export type InsertIdea = typeof ideasTable.$inferInsert;
export type SelectIdea = typeof ideasTable.$inferSelect;

export type InsertIdeaNote = typeof ideaNotesTable.$inferInsert;
export type SelectIdeaNote = typeof ideaNotesTable.$inferSelect;

export type InsertIdeaVote = typeof ideaVotesTable.$inferInsert;
export type SelectIdeaVote = typeof ideaVotesTable.$inferSelect;

export type InsertAiModel = typeof aiModelsTable.$inferInsert;
export type SelectAiModel = typeof aiModelsTable.$inferSelect;

export type InsertConversation = typeof conversationsTable.$inferInsert;
export type SelectConversation = typeof conversationsTable.$inferSelect;

export type InsertMessage = typeof messagesTable.$inferInsert;
export type SelectMessage = typeof messagesTable.$inferSelect; 