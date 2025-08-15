import { executeSQL } from '@/lib/db/data-api-adapter';
import { createLogger } from '@/lib/logger';
import { ensureRDSNumber, ensureRDSString } from '@/lib/type-helpers';
import type { SqlParameter } from "@aws-sdk/client-rds-data";
interface ChatMessage {
  content?: string;
  role: 'user' | 'assistant' | 'system';
  parts?: Array<{ type: string; text?: string }>;
}

const log = createLogger({ module: 'conversation-handler' });

export interface ConversationOptions {
  messages: ChatMessage[];
  modelId: number;
  conversationId?: number;
  userId: number;
  source?: string;
  executionId?: number;
  context?: Record<string, unknown>;
}

export interface SaveMessageOptions {
  conversationId: number;
  content: string;
  role: 'user' | 'assistant';
  modelId?: number;
  usage?: { totalTokens?: number; promptTokens?: number; completionTokens?: number };
  finishReason?: string;
  reasoningContent?: string;
}

/**
 * Handles conversation creation and management
 */
export async function handleConversation(
  options: ConversationOptions
): Promise<number> {
  const { 
    messages, 
    modelId, 
    conversationId, 
    userId, 
    source, 
    executionId,
    context 
  } = options;
  
  let convId = conversationId;
  
  // Create new conversation if needed
  if (!convId) {
    log.debug('Creating new conversation', { 
      userId, 
      modelId, 
      source 
    });
    
    // Extract text from the first message (AI SDK v2 format)
    let title = 'New Conversation';
    if (messages[0]) {
      // Handle AI SDK v2 format with parts array
      if ('parts' in messages[0] && Array.isArray(messages[0].parts)) {
        const textPart = messages[0].parts.find((part: { type?: string; text?: string }) => part.type === 'text');
        if (textPart && textPart.text) {
          title = textPart.text.substring(0, 100);
        }
      }
      // Fallback to content if it exists (legacy format)
      else if ('content' in messages[0] && typeof messages[0].content === 'string') {
        title = messages[0].content.substring(0, 100);
      }
    }
    
    convId = await createConversation({
      title,
      userId,
      modelId,
      source,
      executionId,
      context
    });
    
    log.info('New conversation created', { conversationId: convId });
  }
  
  // Save user message
  const userMessage = messages[messages.length - 1];
  await saveUserMessage(convId, userMessage);
  
  return convId;
}

/**
 * Creates a new conversation in the database
 */
async function createConversation(params: {
  title: string;
  userId: number;
  modelId: number;
  source?: string;
  executionId?: number;
  context?: Record<string, unknown>;
}): Promise<number> {
  const query = `
    INSERT INTO conversations (title, user_id, model_id, source, execution_id, context)
    VALUES (:title, :userId, :modelId, :source, :executionId, :context::jsonb)
    RETURNING id
  `;
  
  const parameters = [
    { name: 'title', value: { stringValue: params.title } },
    { name: 'userId', value: { longValue: params.userId } },
    { name: 'modelId', value: { longValue: params.modelId } },
    { name: 'source', value: { stringValue: params.source || 'chat' } },
    { 
      name: 'executionId', 
      value: params.executionId 
        ? { longValue: params.executionId }
        : { isNull: true }
    },
    { 
      name: 'context', 
      value: params.context 
        ? { stringValue: JSON.stringify(params.context) }
        : { isNull: true }
    }
  ];
  
  const result = await executeSQL<{ id: number }>(query, parameters);
  return Number(result[0].id);
}

/**
 * Saves a user message to the database
 */
async function saveUserMessage(
  conversationId: number,
  message: ChatMessage
): Promise<void> {
  // Extract text content from message (AI SDK v2 format or legacy)
  let content = '';
  
  if (message) {
    // Handle AI SDK v2 format with parts array
    if ('parts' in message && Array.isArray(message.parts)) {
      const textPart = message.parts.find((part: { type?: string; text?: string }) => part.type === 'text');
      if (textPart && textPart.text) {
        content = textPart.text;
      }
    }
    // Fallback to content if it exists (legacy format)
    else if ('content' in message && typeof message.content === 'string') {
      content = message.content;
    }
  }
  
  const query = `
    INSERT INTO messages (conversation_id, role, content)
    VALUES (:conversationId, :role, :content)
  `;
  
  const parameters = [
    { name: 'conversationId', value: { longValue: conversationId } },
    { name: 'role', value: { stringValue: 'user' } },
    { name: 'content', value: { stringValue: content } }
  ];
  
  await executeSQL(query, parameters);
  
  log.debug('User message saved', { conversationId, contentLength: content.length });
}

/**
 * Saves an assistant message to the database
 */
export async function saveAssistantMessage(
  options: SaveMessageOptions
): Promise<void> {
  const { 
    conversationId, 
    content, 
    modelId, 
    usage, 
    reasoningContent 
  } = options;
  
  // Only save if there's actual content
  if (!content || content.length === 0) {
    log.warn('No content to save for assistant message');
    return;
  }
  
  try {
    const query = `
      INSERT INTO messages (
        conversation_id, 
        role, 
        content, 
        model_id, 
        reasoning_content, 
        token_usage
      ) 
      VALUES (
        :conversationId, 
        :role, 
        :content, 
        :modelId, 
        :reasoningContent, 
        :tokenUsage::jsonb
      )
    `;
    
    const parameters = [
      { name: 'conversationId', value: { longValue: conversationId } },
      { name: 'role', value: { stringValue: 'assistant' } },
      { name: 'content', value: { stringValue: content } },
      { 
        name: 'modelId', 
        value: modelId ? { longValue: modelId } : { isNull: true }
      },
      { 
        name: 'reasoningContent', 
        value: reasoningContent 
          ? { stringValue: typeof reasoningContent === 'string' 
              ? reasoningContent 
              : JSON.stringify(reasoningContent) }
          : { isNull: true }
      },
      { 
        name: 'tokenUsage', 
        value: usage 
          ? { stringValue: JSON.stringify(usage) }
          : { isNull: true }
      }
    ];
    
    await executeSQL(query, parameters);
    
    log.info('Assistant message saved', {
      conversationId,
      modelId,
      hasReasoning: !!reasoningContent,
      hasUsage: !!usage,
      contentLength: content.length
    });
    
  } catch (error) {
    log.error('Error saving assistant message', { 
      error,
      conversationId 
    });
    throw error;
  }
}

/**
 * Get model configuration from database
 */
export async function getModelConfig(modelId: string | number) {
  log.info('getModelConfig called', { modelId, type: typeof modelId });
  
  const isNumericId = typeof modelId === 'number' || /^\d+$/.test(String(modelId));
  
  let query: string;
  let parameters: SqlParameter[];
  
  if (isNumericId) {
    query = `
      SELECT id, name, provider, model_id
      FROM ai_models
      WHERE id = :modelId AND active = true AND chat_enabled = true
      LIMIT 1
    `;
    parameters = [
      { name: 'modelId', value: { longValue: Number(modelId) } }
    ];
  } else {
    query = `
      SELECT id, name, provider, model_id
      FROM ai_models
      WHERE model_id = :modelId AND active = true AND chat_enabled = true
      LIMIT 1
    `;
    parameters = [
      { name: 'modelId', value: { stringValue: String(modelId) } }
    ];
  }
  
  const result = await executeSQL<{ id: number; name: string; provider: string; model_id: string }>(query, parameters);
  
  if (result.length === 0) {
    log.error('Model not found', { modelId });
    return null;
  }
  
  // The database returns snake_case but RDS Data API adapter converts to camelCase
  // However, 'model_id' might not be converted properly, so access it directly
  const rawResult = result[0] as { id: number; name: string; provider: string; model_id?: string; modelId?: string };
  
  log.info('Model found in database', { 
    rawResult,
    model_id: rawResult.model_id || rawResult.modelId
  });
  
  return {
    id: ensureRDSNumber(rawResult.id),
    name: ensureRDSString(rawResult.name),
    provider: ensureRDSString(rawResult.provider),
    model_id: ensureRDSString(rawResult.model_id || rawResult.modelId)
  };
}

/**
 * Get existing conversation context
 */
export async function getConversationContext(
  conversationId: number
): Promise<Record<string, unknown> | null> {
  try {
    const query = `
      SELECT c.context, c.execution_id
      FROM conversations c
      WHERE c.id = :conversationId
    `;
    
    const result = await executeSQL<{ context: string; execution_id: number }>(query, [
      { name: 'conversationId', value: { longValue: conversationId } }
    ]);
    
    if (result.length === 0) {
      return null;
    }
    
    const conversation = result[0];
    
    // Parse stored context if available
    if (conversation.context) {
      try {
        return JSON.parse(conversation.context);
      } catch (error) {
        log.warn('Failed to parse conversation context', { 
          conversationId,
          error 
        });
      }
    }
    
    return { executionId: conversation.execution_id };
    
  } catch (error) {
    log.error('Error getting conversation context', { 
      error,
      conversationId 
    });
    return null;
  }
}