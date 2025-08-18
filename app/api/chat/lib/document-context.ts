import { createLogger } from '@/lib/logger';
import { 
  getDocumentsByConversationId, 
  getDocumentChunksByDocumentId, 
  getDocumentById 
} from '@/lib/db/queries/documents';
import type { SelectDocument, SelectDocumentChunk } from '@/types/db-types';

const log = createLogger({ module: 'document-context' });

export interface DocumentContextOptions {
  conversationId?: number;
  documentId?: string;
  userMessage: string;
}

/**
 * Retrieves and formats document context based on user message relevance
 */
export async function getDocumentContext(
  options: DocumentContextOptions
): Promise<string> {
  const { conversationId, documentId, userMessage } = options;
  
  log.debug('Getting document context', { 
    conversationId, 
    documentId,
    messageLength: userMessage.length 
  });
  
  try {
    let documents: SelectDocument[] = [];
    
    // Get documents linked to conversation
    if (conversationId) {
      documents = await getDocumentsByConversationId({ 
        conversationId 
      });
      log.debug(`Found ${documents.length} documents for conversation`);
    }
    
    // Add specific document if provided
    if (documentId) {
      const docId = typeof documentId === 'string' ? parseInt(documentId, 10) : documentId;
      if (!isNaN(docId)) {
        const singleDoc = await getDocumentById({ id: docId });
        if (singleDoc && !documents.find(d => d.id === docId)) {
          documents.push(singleDoc);
          log.debug('Added specific document to context');
        }
      }
    }
    
    if (documents.length === 0) {
      log.debug('No documents found');
      return '';
    }
    
    // Get chunks for all documents
    const documentChunks = await getRelevantChunks(
      documents, 
      userMessage
    );
    
    if (documentChunks.length === 0) {
      log.debug('No relevant chunks found');
      return '';
    }
    
    // Format document context
    const documentNames = documents.map(doc => doc.name).join(', ');
    const context = formatDocumentContext(documentChunks, documentNames);
    
    log.debug('Document context created', { 
      chunkCount: documentChunks.length,
      contextLength: context.length 
    });
    
    return context;
    
  } catch (error) {
    log.error('Error getting document context', { error });
    return '';
  }
}

/**
 * Get relevant chunks based on user message
 */
async function getRelevantChunks(
  documents: SelectDocument[],
  userMessage: string
): Promise<SelectDocumentChunk[]> {
  // Get all chunks for all documents
  const chunkPromises = documents.map(doc => 
    getDocumentChunksByDocumentId({ documentId: doc.id })
  );
  const chunkArrays = await Promise.all(chunkPromises);
  let allChunks = chunkArrays.flat();
  
  // If no chunks found but we have documents, retry with exponential backoff
  // (chunks might still be processing)
  if (allChunks.length === 0 && documents.length > 0) {
    log.debug('No chunks found, retrying with exponential backoff...');
    
    const maxRetries = 5;
    let retryCount = 0;
    
    while (retryCount < maxRetries && allChunks.length === 0) {
      // Exponential backoff: 100ms, 200ms, 400ms, 800ms, 1600ms
      const delay = 100 * Math.pow(2, retryCount);
      log.debug(`Retry ${retryCount + 1}/${maxRetries} after ${delay}ms`);
      
      await new Promise(resolve => setTimeout(resolve, delay));
      
      const retryPromises = documents.map(doc => 
        getDocumentChunksByDocumentId({ documentId: doc.id })
      );
      const retryArrays = await Promise.all(retryPromises);
      allChunks = retryArrays.flat();
      
      retryCount++;
    }
    
    if (allChunks.length === 0) {
      log.warn('Document chunks still not available after retries', {
        documentIds: documents.map(d => d.id),
        retryCount
      });
    }
  }
  
  if (allChunks.length === 0) {
    return [];
  }
  
  // Determine if this is a general document query
  const generalQueries = [
    'this', 'document', 'file', 'pdf', 
    'uploaded', 'attachment', 'content'
  ];
  const lowerMessage = userMessage.toLowerCase();
  const isGeneralQuery = generalQueries.some(term => 
    lowerMessage.includes(term)
  );
  const isSummaryRequest = lowerMessage.includes('summar');
  
  let relevantChunks: SelectDocumentChunk[] = [];
  
  if (isGeneralQuery || isSummaryRequest) {
    // For general queries or summaries, include first 5 chunks
    relevantChunks = allChunks.slice(0, 5);
    log.debug('Using general document selection', { 
      chunkCount: relevantChunks.length 
    });
  } else {
    // For specific queries, find relevant chunks by keyword matching
    const keywords = lowerMessage
      .split(/\s+/)
      .filter(word => word.length > 2);
    
    relevantChunks = allChunks
      .filter(chunk => {
        const content = chunk.content.toLowerCase();
        return keywords.some(keyword => content.includes(keyword));
      })
      .slice(0, 3); // Top 3 most relevant
    
    log.debug('Using keyword-based selection', { 
      keywords,
      matchedChunks: relevantChunks.length 
    });
  }
  
  // If no matches but we have chunks, include at least first 3
  if (relevantChunks.length === 0 && allChunks.length > 0) {
    relevantChunks = allChunks.slice(0, 3);
    log.debug('No keyword matches, using first chunks');
  }
  
  return relevantChunks;
}

/**
 * Format document chunks into a context string
 */
function formatDocumentContext(
  chunks: SelectDocumentChunk[],
  documentNames: string
): string {
  if (chunks.length === 0) {
    return `\n\nNote: A document was uploaded but its content could not be extracted or is still being processed. The document name is: ${documentNames}`;
  }
  
  const excerpts = chunks.map((chunk, idx) => 
    `[Document Excerpt ${idx + 1}]:\n${chunk.content}`
  ).join('\n\n');
  
  return `\n\nRelevant content from uploaded documents (${documentNames}):\n\n${excerpts}\n\nPlease use this document content to answer the user's questions when relevant.`;
}