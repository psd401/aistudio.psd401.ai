import { InsertDocument, SelectDocument, InsertDocumentChunk, SelectDocumentChunk } from "@/db/schema";
import logger from "@/lib/logger"
import { executeSQL } from "@/lib/db/data-api-adapter"

/**
 * Saves a document to the database
 */
export async function saveDocument(document: InsertDocument): Promise<SelectDocument> {
  try {
    const query = `
      INSERT INTO documents (id, name, type, url, size, user_id, conversation_id)
      VALUES (:id, :name, :type, :url, :size, :userId, :conversationId)
      RETURNING id, name, type, url, size, user_id, conversation_id, created_at
    `;
    const parameters = [
      { name: 'id', value: { stringValue: document.id } },
      { name: 'name', value: { stringValue: document.name } },
      { name: 'type', value: { stringValue: document.type } },
      { name: 'url', value: { stringValue: document.url } },
      { name: 'size', value: document.size ? { longValue: document.size } : { isNull: true } },
      { name: 'userId', value: { stringValue: document.userId } },
      { name: 'conversationId', value: document.conversationId ? { longValue: document.conversationId } : { isNull: true } }
    ];
    
    const results = await executeSQL(query, parameters);
    if (results.length === 0) {
      throw new Error('Failed to save document');
    }
    return results[0] as SelectDocument;
  } catch (error) {
    logger.error("Error saving document", { document, error });
    throw error;
  }
}

/**
 * Gets a document by id
 */
export async function getDocumentById({ id }: { id: string }): Promise<SelectDocument | undefined> {
  try {
    const query = `
      SELECT id, name, type, url, size, user_id, conversation_id, created_at
      FROM documents
      WHERE id = :id
      LIMIT 1
    `;
    const parameters = [
      { name: 'id', value: { stringValue: id } }
    ];
    
    const results = await executeSQL(query, parameters);
    return results[0] as SelectDocument | undefined;
  } catch (error) {
    logger.error("Error fetching document by ID", { id, error });
    return undefined;
  }
}

/**
 * Gets documents by user id
 */
export async function getDocumentsByUserId({ userId }: { userId: string }): Promise<SelectDocument[]> {
  try {
    const query = `
      SELECT id, name, type, url, size, user_id, conversation_id, created_at
      FROM documents
      WHERE user_id = :userId
      ORDER BY created_at DESC
    `;
    const parameters = [
      { name: 'userId', value: { stringValue: userId } }
    ];
    
    const results = await executeSQL(query, parameters);
    return results as SelectDocument[];
  } catch (error) {
    logger.error("Error fetching documents by user ID", { userId, error });
    return [];
  }
}

/**
 * Gets documents by conversation id
 */
export async function getDocumentsByConversationId({ 
  conversationId 
}: { 
  conversationId: number 
}): Promise<SelectDocument[]> {
  logger.info("Fetching documents by conversation ID", { conversationId });
  try {
    const query = `
      SELECT id, name, type, url, size, user_id, conversation_id, created_at
      FROM documents
      WHERE conversation_id = :conversationId
    `;
    const parameters = [
      { name: 'conversationId', value: { longValue: conversationId } }
    ];
    
    const results = await executeSQL(query, parameters);
    logger.info("Documents query completed", { conversationId, resultCount: results.length });
    return results as SelectDocument[];
  } catch (error) {
    logger.error("Error fetching documents by conversation ID", { conversationId, error });
    return [];
  }
}

/**
 * Deletes a document by id
 */
export async function deleteDocumentById({ id }: { id: string }): Promise<void> {
  try {
    const query = `
      DELETE FROM documents
      WHERE id = :id
    `;
    const parameters = [
      { name: 'id', value: { stringValue: id } }
    ];
    
    await executeSQL(query, parameters);
  } catch (error) {
    logger.error("Error deleting document", { id, error });
    throw error;
  }
}

/**
 * Saves a document chunk to the database
 */
export async function saveDocumentChunk(chunk: InsertDocumentChunk): Promise<SelectDocumentChunk> {
  try {
    const query = `
      INSERT INTO document_chunks (id, document_id, content, chunk_index)
      VALUES (:id, :documentId, :content, :chunkIndex)
      RETURNING id, document_id, content, chunk_index, created_at
    `;
    const parameters = [
      { name: 'id', value: { stringValue: chunk.id } },
      { name: 'documentId', value: { stringValue: chunk.documentId } },
      { name: 'content', value: { stringValue: chunk.content } },
      { name: 'chunkIndex', value: { longValue: chunk.chunkIndex } }
    ];
    
    const results = await executeSQL(query, parameters);
    if (results.length === 0) {
      throw new Error('Failed to save document chunk');
    }
    return results[0] as SelectDocumentChunk;
  } catch (error) {
    logger.error("Error saving document chunk", { chunk, error });
    throw error;
  }
}

/**
 * Gets document chunks by document id
 */
export async function getDocumentChunksByDocumentId({ 
  documentId 
}: { 
  documentId: string 
}): Promise<SelectDocumentChunk[]> {
  try {
    const query = `
      SELECT id, document_id, content, chunk_index, created_at
      FROM document_chunks
      WHERE document_id = :documentId
      ORDER BY chunk_index ASC
    `;
    const parameters = [
      { name: 'documentId', value: { stringValue: documentId } }
    ];
    
    const results = await executeSQL(query, parameters);
    return results as SelectDocumentChunk[];
  } catch (error) {
    logger.error("Error fetching document chunks", { documentId, error });
    return [];
  }
}

/**
 * Batch inserts multiple document chunks
 */
export async function batchInsertDocumentChunks(chunks: InsertDocumentChunk[]): Promise<SelectDocumentChunk[]> {
  try {
    const savedChunks: SelectDocumentChunk[] = [];
    
    // RDS Data API doesn't support batch inserts with RETURNING, so we need to insert one by one
    for (const chunk of chunks) {
      const query = `
        INSERT INTO document_chunks (id, document_id, content, chunk_index)
        VALUES (:id, :documentId, :content, :chunkIndex)
        RETURNING id, document_id, content, chunk_index, created_at
      `;
      const parameters = [
        { name: 'id', value: { stringValue: chunk.id } },
        { name: 'documentId', value: { stringValue: chunk.documentId } },
        { name: 'content', value: { stringValue: chunk.content } },
        { name: 'chunkIndex', value: { longValue: chunk.chunkIndex } }
      ];
      
      const results = await executeSQL(query, parameters);
      if (results.length > 0) {
        savedChunks.push(results[0] as SelectDocumentChunk);
      }
    }
    
    return savedChunks;
  } catch (error) {
    logger.error("Error batch inserting document chunks", { chunkCount: chunks.length, error });
    throw error;
  }
}

/**
 * Deletes document chunks by document id
 */
export async function deleteDocumentChunksByDocumentId({ 
  documentId 
}: { 
  documentId: string 
}): Promise<void> {
  try {
    const query = `
      DELETE FROM document_chunks
      WHERE document_id = :documentId
    `;
    const parameters = [
      { name: 'documentId', value: { stringValue: documentId } }
    ];
    
    await executeSQL(query, parameters);
  } catch (error) {
    logger.error("Error deleting document chunks", { documentId, error });
    throw error;
  }
}

/**
 * Update the conversation ID for a given document ID
 */
export async function linkDocumentToConversation(
  documentId: string,
  conversationId: number
): Promise<SelectDocument | undefined> {
  try {
    const query = `
      UPDATE documents
      SET conversation_id = :conversationId
      WHERE id = :documentId
      RETURNING id, name, type, url, size, user_id, conversation_id, created_at
    `;
    const parameters = [
      { name: 'documentId', value: { stringValue: documentId } },
      { name: 'conversationId', value: { longValue: conversationId } }
    ];
    
    const results = await executeSQL(query, parameters);
    return results[0] as SelectDocument | undefined;
  } catch (error) {
    logger.error('Error linking document to conversation', { documentId, conversationId, error });
    // Handle error appropriately, maybe return undefined or throw
    return undefined;
  }
} 