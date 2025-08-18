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
  
  log.debug('Getting knowledge context', {
    repositoryCount: repositoryIds.length,
    hasAssistantOwner: !!assistantOwnerSub,
    messageLength: userMessage.length
  });
  
  if (!repositoryIds || repositoryIds.length === 0) {
    log.debug('No repository IDs provided');
    return '';
  }
  
  try {
    // Retrieve relevant knowledge chunks
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
        similarityThreshold: 0.6 // Lower threshold for follow-up questions
      }
    );
    
    if (knowledgeChunks.length === 0) {
      log.debug('No relevant knowledge chunks found');
      return '';
    }
    
    // Format the knowledge context
    const context = `\n\n${formatKnowledgeContext(knowledgeChunks)}\n\nUse this knowledge to answer the user's question if relevant.`;
    
    log.info('Knowledge context retrieved successfully', {
      chunkCount: knowledgeChunks.length,
      contextLength: context.length
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