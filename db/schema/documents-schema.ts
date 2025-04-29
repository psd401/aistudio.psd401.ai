import { pgTable, text, timestamp, uuid, integer, jsonb } from "drizzle-orm/pg-core"
import { conversationsTable } from "./core-schema"

// Define document types
export const documentTypeEnum = ["pdf", "docx", "ppt", "txt"] as const

export const documentsTable = pgTable("documents", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id").notNull(),
  conversationId: integer("conversation_id").references(() => conversationsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  type: text("type").notNull(),
  size: integer("size").notNull(),
  url: text("url").notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date())
})

export const documentChunksTable = pgTable("document_chunks", {
  id: uuid("id").defaultRandom().primaryKey(),
  documentId: uuid("document_id").references(() => documentsTable.id, { onDelete: "cascade" }).notNull(),
  content: text("content").notNull(),
  embedding: jsonb("embedding"),
  metadata: jsonb("metadata"),
  pageNumber: integer("page_number"),
  chunkIndex: integer("chunk_index").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date())
})

export type InsertDocument = typeof documentsTable.$inferInsert
export type SelectDocument = typeof documentsTable.$inferSelect
export type InsertDocumentChunk = typeof documentChunksTable.$inferInsert
export type SelectDocumentChunk = typeof documentChunksTable.$inferSelect 