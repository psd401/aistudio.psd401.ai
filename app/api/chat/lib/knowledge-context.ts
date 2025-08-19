import { createLogger } from '@/lib/logger';
import { 
  retrieveKnowledgeForPrompt, 
  formatKnowledgeContext 
} from '@/lib/assistant-architect/knowledge-retrieval';

const log = createLogger({ module: 'knowledge-context' });

export interface KnowledgeContextOptions {
  userMessage: string;
  repositoryIds: number[];
  userSub: string;
  assistantOwnerSub?: string;
}

/**
 * Retrieves dynamic knowledge context for assistant execution follow-ups
 */
export async function getKnowledgeContext(
  options: KnowledgeContextOptions
): Promise<string> {
  const { 
    userMessage, 
    repositoryIds, 
    userSub, 
    assistantOwnerSub 
  } = options;
  
  log.info('Getting knowledge context', {
    repositoryCount: repositoryIds.length,
    repositoryIds,
    hasAssistantOwner: !!assistantOwnerSub,
    messageLength: userMessage.length,
    userMessage: userMessage.substring(0, 100), // Log first 100 chars
    userSub: userSub.substring(0, 8) // Log partial sub for privacy
  });
  
  if (!repositoryIds || repositoryIds.length === 0) {
    log.warn('No repository IDs provided for knowledge retrieval');
    return '';
  }
  
  try {
    // Retrieve relevant knowledge chunks
    log.info('Calling retrieveKnowledgeForPrompt', {
      userMessage: userMessage.substring(0, 100),
      repositoryIds,
      searchType: 'hybrid',
      similarityThreshold: 0.4 // Lowered from 0.6
    });
    
    const knowledgeChunks = await retrieveKnowledgeForPrompt(
      userMessage,
      repositoryIds,
      userSub,
      assistantOwnerSub,
      {
        maxChunks: 10,
        maxTokens: 4000,
        searchType: 'hybrid',
        vectorWeight: 0.8,
        similarityThreshold: 0.4 // Lowered from 0.6 for better recall
      }
    );
    
    if (knowledgeChunks.length === 0) {
      log.warn('No relevant knowledge chunks found', {
        userMessage: userMessage.substring(0, 100),
        repositoryIds,
        threshold: 0.4
      });
      return '';
    }
    
    // Format the knowledge context
    const context = `\n\n${formatKnowledgeContext(knowledgeChunks)}\n\nUse this knowledge to answer the user's question if relevant.`;
    
    log.info('Knowledge context retrieved successfully', {
      chunkCount: knowledgeChunks.length,
      contextLength: context.length,
      topChunkSimilarity: knowledgeChunks[0]?.similarity,
      chunkPreviews: knowledgeChunks.slice(0, 3).map(c => ({
        similarity: c.similarity,
        contentPreview: c.content.substring(0, 50)
      }))
    });
    
    return context;
    
  } catch (error) {
    log.error('Error retrieving knowledge context', { 
      error,
      repositoryIds 
    });
    // Continue without knowledge context if retrieval fails
    return '';
  }
}

/**
 * Get assistant owner's sub from database
 */
export async function getAssistantOwnerSub(
  assistantUserId: number
): Promise<string | undefined> {
  try {
    const { executeSQL } = await import('@/lib/db/data-api-adapter');
    
    const query = `
      SELECT u.cognito_sub 
      FROM users u 
      WHERE u.id = :userId
    `;
    
    const result = await executeSQL<{ cognito_sub: string }>(query, [
      { name: 'userId', value: { longValue: assistantUserId } }
    ]);
    
    return result[0]?.cognito_sub;
    
  } catch (error) {
    log.error('Error getting assistant owner sub', { 
      error,
      assistantUserId 
    });
    return undefined;
  }
}