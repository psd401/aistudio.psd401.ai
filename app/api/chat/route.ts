import { UIMessage } from 'ai';
import { getServerSession } from '@/lib/auth/server-session';
import { getCurrentUserAction } from '@/actions/db/get-current-user-action';
import { createLogger, generateRequestId, startTimer } from '@/lib/logger';
import { buildSystemPrompt } from './lib/system-prompt-builder';
import { 
  handleConversation, 
  saveAssistantMessage, 
  getModelConfig,
  getConversationContext 
} from './lib/conversation-handler';
import { loadExecutionContextData, buildInitialPromptForStreaming } from './lib/execution-context';
import { getAssistantOwnerSub } from './lib/knowledge-context';
import { unifiedStreamingService } from '@/lib/streaming/unified-streaming-service';
import type { StreamRequest } from '@/lib/streaming/types';

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

/**
 * Main chat API route following AI SDK v5 patterns
 * Clean, modular, and extensible design
 */
export async function POST(req: Request) {
  const requestId = generateRequestId();
  const timer = startTimer('api.chat');
  const log = createLogger({ requestId, route: 'api.chat' });
  
  log.info('POST /api/chat - Processing chat request');
  
  try {
    // 1. Parse and validate request
    const body = await req.json();
    
    // Debug: Log the entire request body to understand structure
    log.info('Raw request body received', { 
      body,
      bodyKeys: Object.keys(body),
      messages: body.messages?.length || 0,
      modelId: body.modelId,
      allFields: JSON.stringify(body).substring(0, 500)
    });
    
    // Extract fields from the request body
    // AI SDK v2 sends custom data at root level alongside messages
    const messages: UIMessage[] = body.messages || [];
    
    // Custom data is sent at root level with messages in AI SDK v2
    const modelId = body.modelId;
    const existingConversationId = body.conversationId;
    const documentId = body.documentId;
    const source = body.source || 'chat';
    const executionId = body.executionId;
    
    log.debug('Request parsed', {
      messageCount: messages.length,
      modelId,
      hasConversationId: !!existingConversationId,
      hasDocumentId: !!documentId,
      source
    });
    
    // 2. Authenticate user
    const session = await getServerSession();
    if (!session) {
      log.warn('Unauthorized request - no session');
      timer({ status: 'error', reason: 'unauthorized' });
      return new Response('Unauthorized', { status: 401 });
    }
    
    log.debug('User authenticated', { userId: session.sub });
    
    // 3. Get current user
    const currentUser = await getCurrentUserAction();
    if (!currentUser.isSuccess) {
      log.error('Failed to get current user');
      return new Response('Unauthorized', { status: 401 });
    }
    
    // 4. Get model configuration from database
    const modelConfig = await getModelConfig(modelId);
    if (!modelConfig) {
      log.error('Model not found', { modelId });
      return new Response(
        JSON.stringify({ error: 'Selected model not found or not enabled for chat' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    log.info('Model configured', {
      provider: modelConfig.provider,
      modelId: modelConfig.model_id,
      dbId: modelConfig.id
    });
    
    // 5. Load execution context if needed (for new conversations)
    let fullContext: Record<string, unknown> | undefined;
    let repositoryIds: number[] = [];
    let assistantOwnerSub: string | undefined;
    
    if (!existingConversationId && executionId) {
      const validExecutionId = validateExecutionId(executionId);
      if (validExecutionId) {
        log.debug('Loading execution context', { executionId: validExecutionId });
        const execResult = await loadExecutionContextData(validExecutionId);
        if (execResult) {
          fullContext = execResult.completeData;
          repositoryIds = execResult.completeData.repositoryIds || [];
          
          // Get assistant owner sub if available
          const execution = (fullContext as Record<string, unknown>)?.execution as { assistant_user_id?: number };
          if (execution?.assistant_user_id) {
            assistantOwnerSub = await getAssistantOwnerSub(
              execution.assistant_user_id
            );
          }
          
          log.info('Execution context loaded', {
            repositoryCount: repositoryIds.length,
            repositoryIds,
            hasAssistantOwner: !!assistantOwnerSub,
            assistantOwnerSub
          });
        }
      }
    }
    
    // 6. Handle conversation (lazy creation for new chats)
    // Convert UIMessage to ChatMessage format    
    const chatMessages = messages.map((msg: { role: string; parts?: unknown[]; content?: string }) => ({
      role: msg.role as 'user' | 'assistant' | 'system',
      parts: msg.parts?.map((p: unknown) => {
        const part = p as { type?: string; text?: string };
        return {
          type: part.type || 'text',
          text: part.text
        };
      }),
      content: msg.content
    }));
    
    log.info('Starting conversation handling', {
      hasExistingConversation: !!existingConversationId,
      messageCount: chatMessages.length,
      source,
      hasDocumentId: !!documentId
    });
    
    // Lazy conversation creation - only create when needed
    let conversationId = existingConversationId;
    
    // For new chats, create conversation atomically with first message
    if (!existingConversationId) {
      conversationId = await handleConversation({
        messages: chatMessages,
        modelId: modelConfig.id,
        conversationId: undefined,
        userId: currentUser.data.user.id,
        source,
        executionId: validateExecutionId(executionId),
        context: fullContext,
        documentId
      });
      
      log.info('New conversation created', { 
        conversationId,
        userId: currentUser.data.user.id
      });
    } else {
      // For existing conversations, just save the user message
      await handleConversation({
        messages: chatMessages,
        modelId: modelConfig.id,
        conversationId: existingConversationId,
        userId: currentUser.data.user.id,
        source,
        executionId: validateExecutionId(executionId),
        context: fullContext,
        documentId
      });
      
      log.info('Message added to existing conversation', { 
        conversationId: existingConversationId
      });
    }
    
    // Validate conversation ID
    if (!conversationId || conversationId <= 0) {
      log.error('Invalid conversation ID', { 
        conversationId,
        existingConversationId,
        userId: currentUser.data.user.id
      });
      timer({ status: 'error', reason: 'invalid_conversation_id' });
      return new Response(
        JSON.stringify({ 
          error: 'Failed to create or retrieve conversation',
          details: 'Unable to process chat request.',
          requestId
        }),
        { 
          status: 500, 
          headers: { 
            'Content-Type': 'application/json',
            'X-Request-Id': requestId
          } 
        }
      );
    }
    
    // 7. Get existing conversation context if needed
    if (existingConversationId && !fullContext) {
      const existingContext = await getConversationContext(existingConversationId);
      if (existingContext) {
        fullContext = existingContext;
        
        // Extract repository IDs and assistant owner sub from stored context
        const contextWithIds = fullContext as { repositoryIds?: number[]; assistantOwnerSub?: string };
        if (contextWithIds?.repositoryIds) {
          repositoryIds = contextWithIds.repositoryIds;
        }
        if (contextWithIds?.assistantOwnerSub) {
          assistantOwnerSub = contextWithIds.assistantOwnerSub;
        }
      }
    }
    
    // 8. Process messages for initial assistant executions
    // Normalize messages to ensure they have the correct format for AI SDK v5
    // AI SDK v5 expects UIMessage format with parts array
    let processedMessages = messages.map((msg: UIMessage) => {
      // If message already has parts array, use it as-is
      if (msg.parts && Array.isArray(msg.parts)) {
        return msg;
      }
      
      // If message has content property (legacy format), convert to parts
      if ('content' in msg && typeof msg.content === 'string') {
        return {
          ...msg,
          parts: [{ type: 'text' as const, text: msg.content }]
        };
      }
      
      // Otherwise, return as-is and let convertToModelMessages handle it
      return msg;
    });
    
    let originalUserQuestion: string | undefined;
    if (source === 'assistant_execution' && executionId && !existingConversationId) {
      const validExecutionId = validateExecutionId(executionId);
      if (validExecutionId) {
        const promptData = await buildInitialPromptForStreaming(validExecutionId);
        if (promptData) {
          // Replace the last message (which contains raw JSON) with the processed prompt
          processedMessages = processedMessages.slice(0, -1).concat([{
            ...processedMessages[processedMessages.length - 1],
            parts: [{ type: 'text' as const, text: promptData.processedPrompt }]
          }]);
          
          // Extract the original user question from the inputs
          // Look for common field names that might contain the user's question
          const possibleFields = ['question', 'query', 'prompt', 'input', 'message', 'text'];
          for (const field of possibleFields) {
            if (promptData.originalInputs[field]) {
              originalUserQuestion = String(promptData.originalInputs[field]);
              break;
            }
          }
          // If no specific field found, use the first string value
          if (!originalUserQuestion) {
            const firstStringValue = Object.values(promptData.originalInputs).find(v => typeof v === 'string');
            if (firstStringValue) {
              originalUserQuestion = String(firstStringValue);
            }
          }
          
          log.info('Replaced raw JSON with processed prompt for initial execution', {
            executionId: validExecutionId,
            promptLength: promptData.processedPrompt.length,
            originalQuestion: originalUserQuestion
          });
        }
      }
    }
    
    // 9. Build context-aware system prompt
    const systemPrompt = await buildSystemPrompt({
      source,
      executionId: validateExecutionId(executionId),
      conversationId,
      documentId,
      userMessage: (() => {
        // For initial assistant executions, use the original user question for knowledge retrieval
        if (originalUserQuestion && source === 'assistant_execution' && !existingConversationId) {
          return originalUserQuestion;
        }
        // Otherwise, use the message content as usual
        const lastMsg = processedMessages[processedMessages.length - 1] as { parts?: Array<{ type?: string; text?: string }>; content?: string };
        // Try to get content from parts first (AI SDK v2)
        if (lastMsg.parts && lastMsg.parts.length > 0) {
          const textPart = lastMsg.parts.find(p => p.type === 'text');
          if (textPart?.text) return textPart.text;
        }
        // Fallback to content field
        return lastMsg.content || '';
      })(),
      session: { sub: session.sub },
      existingContext: {
        repositoryIds,
        assistantOwnerSub
      }
    });
    
    log.debug('System prompt built', { 
      promptLength: systemPrompt.length 
    });
    
    // 9. Use unified streaming service
    log.info('Using unified streaming service', { 
      provider: modelConfig.provider,
      model: modelConfig.model_id
    });
    
    // Create streaming request with callbacks
    const streamRequest: StreamRequest = {
        messages: processedMessages,
        modelId: modelConfig.model_id,
        provider: modelConfig.provider,
        userId: currentUser.data.user.id.toString(),
        sessionId: session.sub,
        conversationId,
        source: 'chat',
        documentId,
        systemPrompt,
        options: {
          reasoningEffort: body.reasoningEffort || 'medium',
          responseMode: body.responseMode || 'standard'
        },
        callbacks: {
          onFinish: async ({ text, usage, finishReason }) => {
            log.info('Unified stream finished', {
              hasText: !!text,
              textLength: text?.length || 0,
              hasUsage: !!usage,
              finishReason,
              conversationId,
              modelId: modelConfig.id
            });
            
            try {
              // Validate conversation still exists before saving
              if (!conversationId || conversationId <= 0) {
                throw new Error(`Invalid conversation ID at save time: ${conversationId}`);
              }
              
              await saveAssistantMessage({
                conversationId,
                content: text,
                role: 'assistant',
                modelId: modelConfig.id,
                usage,
                finishReason,
                reasoningContent: undefined // TODO: Extract from stream
              });
              
              log.info('Assistant message saved successfully', {
                conversationId,
                modelId: modelConfig.id
              });
            } catch (saveError) {
              log.error('Failed to save assistant message', {
                error: saveError,
                conversationId,
                modelId: modelConfig.id
              });
              // Error is logged but not thrown to avoid breaking the stream
              // The unified streaming service will also log this
            }
            
            timer({ 
              status: 'success',
              conversationId,
              tokensUsed: usage?.totalTokens
            });
          }
        }
      };
      
      const streamResponse = await unifiedStreamingService.stream(streamRequest);
      
      // Return unified streaming response
      log.info('Returning unified streaming response', {
        conversationId,
        requestId,
        hasConversationId: !!conversationId,
        supportsReasoning: streamResponse.capabilities.supportsReasoning
      });
      
      // Only send conversation ID header for new conversations
      const responseHeaders: Record<string, string> = {
        'X-Request-Id': requestId,
        'X-Unified-Streaming': 'true',
        'X-Supports-Reasoning': streamResponse.capabilities.supportsReasoning.toString()
      };
      
      if (!existingConversationId && conversationId) {
        responseHeaders['X-Conversation-Id'] = conversationId.toString();
      }
      
      return streamResponse.result.toUIMessageStreamResponse({
        headers: responseHeaders
      });
    
  } catch (error) {
    log.error('Chat API error', { 
      error: error instanceof Error ? {
        message: error.message,
        name: error.name,
        stack: error.stack
      } : String(error)
    });
    
    timer({ status: 'error' });
    
    // Return detailed error response
    return new Response(
      JSON.stringify({
        error: 'Failed to process chat request',
        details: error instanceof Error ? error.message : 'Unknown error',
        requestId
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'X-Request-Id': requestId
        }
      }
    );
  }
}

/**
 * Validates and parses execution ID
 */
function validateExecutionId(executionId: unknown): number | undefined {
  if (!executionId) return undefined;
  
  // Reject invalid string values
  if (executionId === 'streaming' || 
      executionId === 'undefined' || 
      executionId === 'null') {
    return undefined;
  }
  
  // Parse to number
  const parsed = typeof executionId === 'string' 
    ? parseInt(executionId, 10) 
    : typeof executionId === 'number' ? executionId : NaN;
  
  // Validate it's a positive number
  if (!isNaN(parsed) && parsed > 0) {
    return parsed;
  }
  
  return undefined;
}