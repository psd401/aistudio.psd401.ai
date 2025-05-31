import { db } from "@/db/db";
import { documentsTable, documentChunksTable } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { InsertDocument, SelectDocument, InsertDocumentChunk, SelectDocumentChunk } from "@/db/schema";
import logger from "@/lib/logger"

/**
 * Saves a document to the database
 */
export async function saveDocument(document: InsertDocument): Promise<SelectDocument> {
  const [savedDocument] = await db.insert(documentsTable).values(document).returning();
  return savedDocument;
}

/**
 * Gets a document by id
 */
export async function getDocumentById({ id }: { id: string }): Promise<SelectDocument | undefined> {
  const [document] = await db.select().from(documentsTable).where(eq(documentsTable.id, id));
  return document;
}

/**
 * Gets documents by user id
 */
export async function getDocumentsByUserId({ userId }: { userId: string }): Promise<SelectDocument[]> {
  return await db.select().from(documentsTable).where(eq(documentsTable.userId, userId));
}

/**
 * Gets documents by conversation id
 */
export async function getDocumentsByConversationId({ 
  conversationId 
}: { 
  conversationId: number 
}): Promise<SelectDocument[]> {
  // Only log if this is a valuable troubleshooting step
  logger.info("Fetching documents by conversation ID", { conversationId });
  try {
    // Generate and log the SQL query
    const query = db.select()
      .from(documentsTable)
      .where(eq(documentsTable.conversationId, conversationId));
    
    // Remove noisy query logs unless needed for debugging
    
    const results = await query;
    logger.info("Documents query completed", { conversationId, resultCount: results.length });
    return results;
  } catch (error) {
    logger.error("Error fetching documents by conversation ID", { conversationId, error });
    return [];
  }
}

/**
 * Deletes a document by id
 */
export async function deleteDocumentById({ id }: { id: string }): Promise<void> {
  await db.delete(documentsTable).where(eq(documentsTable.id, id));
}

/**
 * Saves a document chunk to the database
 */
export async function saveDocumentChunk(chunk: InsertDocumentChunk): Promise<SelectDocumentChunk> {
  const [savedChunk] = await db.insert(documentChunksTable).values(chunk).returning();
  return savedChunk;
}

/**
 * Gets document chunks by document id
 */
export async function getDocumentChunksByDocumentId({ 
  documentId 
}: { 
  documentId: string 
}): Promise<SelectDocumentChunk[]> {
  return await db.select()
    .from(documentChunksTable)
    .where(eq(documentChunksTable.documentId, documentId));
}

/**
 * Batch inserts multiple document chunks
 */
export async function batchInsertDocumentChunks(chunks: InsertDocumentChunk[]): Promise<SelectDocumentChunk[]> {
  const savedChunks = await db.insert(documentChunksTable).values(chunks).returning();
  return savedChunks;
}

/**
 * Deletes document chunks by document id
 */
export async function deleteDocumentChunksByDocumentId({ 
  documentId 
}: { 
  documentId: string 
}): Promise<void> {
  await db.delete(documentChunksTable).where(eq(documentChunksTable.documentId, documentId));
}

/**
 * Update the conversation ID for a given document ID
 */
export async function linkDocumentToConversation(
  documentId: string,
  conversationId: number
): Promise<SelectDocument | undefined> {
  try {
    const [updatedDocument] = await db
      .update(documentsTable)
      .set({ conversationId })
      .where(eq(documentsTable.id, documentId))
      .returning();
    return updatedDocument;
  } catch (error) {
    logger.error('Error linking document to conversation', { documentId, conversationId, error });
    // Handle error appropriately, maybe return undefined or throw
    return undefined;
  }
} 