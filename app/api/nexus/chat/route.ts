import { getServerSession } from '@/lib/auth/server-session';
import { createLogger, generateRequestId, startTimer, sanitizeForLogging } from '@/lib/logger';
import { ErrorFactories } from '@/lib/error-utils';
import { createResponsesAPIAdapter } from './lib/responses-api';
import { streamHandler } from './lib/stream-handler';
import { executeSQL } from '@/lib/streaming/nexus/db-helpers';

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

export interface ChatRequest {
  message: string;
  conversationId?: string;
  previousResponseId?: string;
  modelId: string;
  provider?: string;
  tools?: string[];
  attachments?: File[];
  options?: {
    useResponsesAPI?: boolean;
    enableCaching?: boolean;
    reasoningEffort?: 'minimal' | 'low' | 'medium' | 'high';
  };
}

/**
 * Nexus Chat API - Multi-provider conversation management with Responses API
 */
export async function POST(req: Request) {
  const requestId = generateRequestId();
  const timer = startTimer('nexus.chat');
  const log = createLogger({ requestId, route: 'nexus.chat' });
  
  log.info('POST /api/nexus/chat - Processing chat request');
  
  try {
    // 1. Parse and validate request
    const body: ChatRequest = await req.json();
    
    log.debug('Request parsed', {
      hasMessage: !!body.message,
      conversationId: body.conversationId,
      previousResponseId: body.previousResponseId,
      modelId: body.modelId,
      provider: body.provider,
      options: sanitizeForLogging(body.options)
    });
    
    // 2. Authenticate user
    const session = await getServerSession();
    if (!session) {
      log.warn('Unauthorized request - no session');
      timer({ status: 'error', reason: 'unauthorized' });
      return new Response('Unauthorized', { status: 401 });
    }
    
    const userId = session.sub;
    log.debug('User authenticated', { userId });
    
    // 3. Determine provider and check capabilities
    const provider = body.provider || 'openai';
    
    // 4. Handle based on provider capabilities
    if (provider === 'openai' && body.options?.useResponsesAPI !== false) {
      return await handleOpenAIResponsesAPI(body, userId, requestId, log, timer);
    } else if (provider === 'anthropic') {
      return await handleAnthropicCaching(body, userId, requestId, log, timer);
    } else if (provider === 'google') {
      return await handleGeminiContextCaching(body, userId, requestId, log, timer);
    } else {
      return await handleStandardStreaming(body, userId, requestId, log, timer);
    }
    
  } catch (error) {
    timer({ status: 'error' });
    log.error('Chat request failed', {
      error: error instanceof Error ? error.message : String(error)
    });
    
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Internal server error'
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

/**
 * Handle OpenAI with Responses API
 */
async function handleOpenAIResponsesAPI(
  request: ChatRequest,
  userId: string | number,
  requestId: string,
  log: ReturnType<typeof createLogger>,
  timer: ReturnType<typeof startTimer>
) {
  log.info('Using OpenAI Responses API', {
    requestId,
    conversationId: request.conversationId,
    previousResponseId: request.previousResponseId,
    modelId: request.modelId
  });
  
  try {
    // Get API key from settings
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OpenAI API key not configured');
    }
    
    const adapter = createResponsesAPIAdapter(apiKey);
    
    let conversationId = request.conversationId;
    let responseId: string;
    let stream: any;
    
    // Create or get conversation
    if (!conversationId) {
      // Create new conversation in database
      const result = await executeSQL(`
        INSERT INTO nexus_conversations (
          user_id, provider, model_used, title, external_id, 
          message_count, total_tokens, metadata, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW()
        ) RETURNING id
      `, [
        userId,
        'openai',
        request.modelId,
        'New Conversation',
        null, // Will update with response ID
        1,
        0,
        JSON.stringify({ useResponsesAPI: true }),
      ]);
      
      conversationId = result[0].id as string;
      
      log.info('Created new conversation', {
        requestId,
        conversationId
      });
    }
    
    // Handle conversation continuation or new conversation
    if (request.previousResponseId) {
      // Continue existing conversation
      const result = await adapter.continueConversation(
        request.message,
        request.previousResponseId,
        request.modelId,
        {
          store: true,
          includeReasoning: request.options?.reasoningEffort === 'high'
        }
      );
      
      responseId = result.responseId;
      stream = result.stream;
      
      log.info('Continued conversation with Responses API', {
        requestId,
        conversationId,
        responseId,
        previousResponseId: request.previousResponseId
      });
      
    } else {
      // Create new conversation or start fresh
      const messages = [
        { role: 'user' as const, content: request.message }
      ];
      
      const result = await adapter.createConversation(
        messages,
        request.modelId,
        {
          store: true,
          includeReasoning: request.options?.reasoningEffort === 'high',
          metadata: {
            userId,
            conversationId,
            source: 'nexus'
          }
        }
      );
      
      responseId = result.responseId;
      stream = result.stream;
      
      log.info('Created new conversation with Responses API', {
        requestId,
        conversationId,
        responseId
      });
    }
    
    // Update conversation with response ID
    await executeSQL(`
      UPDATE nexus_conversations 
      SET external_id = $1, updated_at = NOW(), last_message_at = NOW()
      WHERE id = $2
    `, [responseId, conversationId]);
    
    // Record event
    await executeSQL(`
      INSERT INTO nexus_conversation_events (
        conversation_id, event_type, event_data, created_at
      ) VALUES ($1, $2, $3, NOW())
    `, [
      conversationId,
      'message_sent',
      JSON.stringify({
        responseId,
        previousResponseId: request.previousResponseId,
        provider: 'openai',
        modelId: request.modelId,
        useResponsesAPI: true
      })
    ]);
    
    // Create SSE stream
    const sseGenerator = streamHandler.handleOpenAIStream(stream as AsyncIterable<any>, responseId);
    const readableStream = streamHandler.createReadableStream(sseGenerator);
    
    timer({ status: 'success' });
    
    return new Response(readableStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Conversation-Id': conversationId || '',
        'X-Response-Id': responseId
      }
    });
    
  } catch (error) {
    log.error('OpenAI Responses API failed', {
      requestId,
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}

/**
 * Handle Anthropic with prompt caching
 */
async function handleAnthropicCaching(
  request: ChatRequest,
  userId: string | number,
  requestId: string,
  log: ReturnType<typeof createLogger>,
  timer: ReturnType<typeof startTimer>
) {
  log.info('Using Anthropic with prompt caching', {
    requestId,
    modelId: request.modelId
  });
  
  // Implementation would use Anthropic's caching mechanism
  // For now, fall back to standard streaming
  return handleStandardStreaming(request, userId, requestId, log, timer);
}

/**
 * Handle Google Gemini with context caching
 */
async function handleGeminiContextCaching(
  request: ChatRequest,
  userId: string | number,
  requestId: string,
  log: ReturnType<typeof createLogger>,
  timer: ReturnType<typeof startTimer>
) {
  log.info('Using Gemini with context caching', {
    requestId,
    modelId: request.modelId
  });
  
  // Implementation would use Gemini's context caching
  // For now, fall back to standard streaming
  return handleStandardStreaming(request, userId, requestId, log, timer);
}

/**
 * Handle standard streaming for providers without special features
 */
async function handleStandardStreaming(
  request: ChatRequest,
  userId: string | number,
  requestId: string,
  log: ReturnType<typeof createLogger>,
  timer: ReturnType<typeof startTimer>
) {
  log.info('Using standard streaming', {
    requestId,
    provider: request.provider,
    modelId: request.modelId
  });
  
  // This would use the existing unified streaming service
  // Implementation details would go here
  
  timer({ status: 'success' });
  
  return new Response(
    JSON.stringify({
      message: 'Standard streaming not yet implemented',
      provider: request.provider,
      modelId: request.modelId
    }),
    {
      status: 501,
      headers: { 'Content-Type': 'application/json' }
    }
  );
}