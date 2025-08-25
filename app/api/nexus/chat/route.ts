import { UIMessage } from 'ai';
import { z } from 'zod';
import { getServerSession } from '@/lib/auth/server-session';
import { getCurrentUserAction } from '@/actions/db/get-current-user-action';
import { createLogger, generateRequestId, startTimer, sanitizeForLogging } from '@/lib/logger';
import { unifiedStreamingService } from '@/lib/streaming/unified-streaming-service';
import type { StreamRequest } from '@/lib/streaming/types';
import { executeSQL } from '@/lib/db/data-api-adapter';
import { buildToolsForRequest } from '@/lib/tools/tool-registry';

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

// Basic input validation schema - keeping it minimal to avoid breaking existing data flows
const ChatRequestSchema = z.object({
  messages: z.array(z.any()), // Keep flexible for UI message format
  modelId: z.string().regex(/^[a-zA-Z0-9\-_.]+$/, 'Invalid model ID format'),
  provider: z.string().optional(),
  conversationId: z.string().optional(),
  enabledTools: z.array(z.string()).optional(),
  reasoningEffort: z.enum(['minimal', 'low', 'medium', 'high']).optional(),
  responseMode: z.enum(['standard', 'priority', 'flex']).optional()
});

/**
 * Nexus Chat API - AI SDK v5 Compatible
 * Follows the same patterns as /api/chat but uses Nexus tables
 */
export async function POST(req: Request) {
  const requestId = generateRequestId();
  const timer = startTimer('api.nexus.chat');
  const log = createLogger({ requestId, route: 'api.nexus.chat' });
  
  log.info('POST /api/nexus/chat - Processing chat request');
  
  try {
    // 1. Parse and validate request with Zod schema
    const body = await req.json();
    
    const validationResult = ChatRequestSchema.safeParse(body);
    if (!validationResult.success) {
      log.warn('Invalid request format', { 
        errors: validationResult.error.issues.map(issue => ({
          path: issue.path.join('.'),
          message: issue.message
        }))
      });
      return new Response(
        JSON.stringify({ 
          error: 'Invalid request format', 
          details: validationResult.error.issues,
          requestId 
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    // Extract validated fields
    const { 
      messages, 
      modelId, 
      provider = 'openai', 
      conversationId: existingConversationId,
      enabledTools = []
    } = validationResult.data;
    
    log.info('Request parsed', sanitizeForLogging({
      messageCount: messages.length,
      modelId,
      provider,
      hasConversationId: !!existingConversationId,
      enabledTools
    }));
    
    // 2. Authenticate user
    const session = await getServerSession();
    if (!session) {
      log.warn('Unauthorized request - no session');
      timer({ status: 'error', reason: 'unauthorized' });
      return new Response('Unauthorized', { status: 401 });
    }
    
    log.debug('User authenticated', sanitizeForLogging({ userId: session.sub }));
    
    // 3. Get current user
    const currentUser = await getCurrentUserAction();
    if (!currentUser.isSuccess) {
      log.error('Failed to get current user');
      return new Response('Unauthorized', { status: 401 });
    }
    
    const userId = currentUser.data.user.id;
    
    // 4. Get model configuration from database
    const modelResult = await executeSQL(
      `SELECT id, provider, model_id 
       FROM ai_models 
       WHERE model_id = :modelId 
       AND active = true 
       AND chat_enabled = true
       LIMIT 1`,
      [{ name: 'modelId', value: { stringValue: modelId } }]
    );
    
    if (modelResult.length === 0) {
      log.error('Model not found or not enabled for chat', { modelId });
      return new Response(
        JSON.stringify({ error: 'Selected model not found or not enabled for chat' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    const modelConfig = modelResult[0];
    const dbModelId = modelConfig.id as number;
    
    log.info('Model configured', sanitizeForLogging({
      provider: modelConfig.provider,
      modelId: modelConfig.model_id,
      dbId: dbModelId
    }));
    
    // 5. Handle conversation (create new or use existing)
    let conversationId: string = existingConversationId || '';
    let conversationTitle = 'New Conversation';
    
    if (!conversationId) {
      // Generate a title from the first user message
      const firstUserMessage = messages.find(m => m.role === 'user');
      if (firstUserMessage) {
        // Extract text content for title generation
        let messageText = '';
        const content = (firstUserMessage as UIMessage & { 
          content?: string | Array<{ type: string; text?: string }> 
        }).content;
        
        if (typeof content === 'string') {
          messageText = content;
        } else if (Array.isArray(content)) {
          const textPart = content.find(part => part.type === 'text' && part.text);
          if (textPart?.text) {
            messageText = textPart.text;
          }
        }
        
        // Generate a concise title (max 100 chars)
        if (messageText) {
          conversationTitle = messageText.slice(0, 100).trim();
          if (messageText.length > 100) {
            conversationTitle += '...';
          }
        }
      }
      
      // Create new Nexus conversation with generated title
      const createResult = await executeSQL(
        `INSERT INTO nexus_conversations (
          user_id, provider, model_used, title, 
          message_count, total_tokens, metadata,
          created_at, updated_at
        ) VALUES (
          :userId, :provider, :modelId, :title,
          0, 0, :metadata::jsonb,
          NOW(), NOW()
        ) RETURNING id`,
        [
          { name: 'userId', value: { longValue: userId } },
          { name: 'provider', value: { stringValue: provider } },
          { name: 'modelId', value: { stringValue: modelId } },
          { name: 'title', value: { stringValue: conversationTitle } },
          { name: 'metadata', value: { stringValue: JSON.stringify({ source: 'nexus' }) } }
        ]
      );
      
      conversationId = createResult[0].id as string;
      
      log.info('Created new Nexus conversation', sanitizeForLogging({ 
        conversationId,
        userId,
        title: conversationTitle
      }));
    }
    
    // 6. Save user message to nexus_messages
    const lastMessage = messages[messages.length - 1];
    if (lastMessage && lastMessage.role === 'user') {
      // Extract text content from message
      let userContent = '';
      let serializableParts: unknown[] = [];
      
      // Handle assistant-ui message format - look for content array
      const messageContent = (lastMessage as UIMessage & { 
        content?: string | Array<{ type: string; text?: string; image?: string }> 
      }).content;
      
      if (messageContent) {
        if (typeof messageContent === 'string') {
          // Simple string content
          userContent = messageContent;
          serializableParts = [{ type: 'text', text: messageContent }];
        } else if (Array.isArray(messageContent)) {
          // Content parts array (includes attachments from assistant-ui)
          messageContent.forEach((part) => {
            if (part.type === 'text' && part.text) {
              userContent += (userContent ? ' ' : '') + part.text;
              serializableParts.push({ type: 'text', text: part.text });
            } else if (part.type === 'image' && part.image) {
              // Store truncated reference only - NOT the full base64 data
              serializableParts.push({ 
                type: 'image',
                // Only store metadata, not the actual image data
                metadata: {
                  hasImage: true,
                  prefix: part.image.substring(0, 50) // Just enough to identify type
                }
              });
            }
          });
        }
      }
      
      await executeSQL(
        `INSERT INTO nexus_messages (
          conversation_id, role, content, parts, 
          model_id, metadata, created_at
        ) VALUES (
          :conversationId::uuid, :role, :content, :parts::jsonb,
          :modelId, :metadata::jsonb, NOW()
        )`,
        [
          { name: 'conversationId', value: { stringValue: conversationId } },
          { name: 'role', value: { stringValue: 'user' } },
          { name: 'content', value: { stringValue: userContent || '' } },
          { name: 'parts', value: { stringValue: JSON.stringify(serializableParts) } },
          { name: 'modelId', value: { longValue: dbModelId } },
          { name: 'metadata', value: { stringValue: JSON.stringify({}) } }
        ]
      );
      
      // Update conversation's last_message_at and message_count
      await executeSQL(
        `UPDATE nexus_conversations 
         SET last_message_at = NOW(), 
             message_count = message_count + 1,
             updated_at = NOW()
         WHERE id = :conversationId::uuid`,
        [{ name: 'conversationId', value: { stringValue: conversationId } }]
      );
      
      log.debug('User message saved to nexus_messages');
    }
    
    // 7. Build tools based on model capabilities and user selection
    log.info('About to build tools', sanitizeForLogging({
      modelId,
      provider, 
      enabledTools,
      enabledToolsLength: enabledTools?.length || 0
    }));
    
    const tools = await buildToolsForRequest(modelId, enabledTools, provider);
    
    log.info('Built tools for request', sanitizeForLogging({ 
      modelId,
      provider,
      enabledTools,
      availableToolCount: Object.keys(tools).length,
      toolNames: Object.keys(tools)
    }));

    // 8. Build system prompt (optional, can add Nexus-specific context here)
    const systemPrompt = `You are a helpful AI assistant in the Nexus interface.`;
    
    // 9. Use unified streaming service (same as regular chat)
    log.info('Using unified streaming service', sanitizeForLogging({ 
      provider,
      model: modelId,
      messagesBeforeStream: messages ? messages.length : 'undefined',
      toolsEnabled: Object.keys(tools).length > 0
    }));
    
    // Create streaming request with callbacks
    // Validate messages before creating request
    if (!messages || !Array.isArray(messages)) {
      log.error('Messages invalid before streaming', sanitizeForLogging({
        messagesProvided: !!messages,
        isArray: Array.isArray(messages),
        type: typeof messages
      }));
      return new Response(
        JSON.stringify({ error: 'Invalid messages array' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    const streamRequest: StreamRequest = {
      messages: messages as UIMessage[], // Back to simple cast
      modelId,
      provider,
      userId: userId.toString(),
      sessionId: session.sub,
      conversationId,
      source: 'chat',  // Use 'chat' as source type (nexus is tracked in metadata)
      systemPrompt,
      tools,
      options: {
        reasoningEffort: validationResult.data.reasoningEffort || 'medium',
        responseMode: validationResult.data.responseMode || 'standard',
        enabledTools: enabledTools || []
      },
      callbacks: {
        onFinish: async ({ text, usage, finishReason }) => {
          log.info('Stream finished, saving assistant message', sanitizeForLogging({
            hasText: !!text,
            textLength: text?.length || 0,
            hasUsage: !!usage,
            finishReason,
            conversationId
          }));
          
          try {
            // Save assistant message to nexus_messages
            await executeSQL(
              `INSERT INTO nexus_messages (
                conversation_id, role, content, 
                model_id, token_usage, finish_reason,
                metadata, created_at
              ) VALUES (
                :conversationId::uuid, :role, :content,
                :modelId, :tokenUsage::jsonb, :finishReason,
                :metadata::jsonb, NOW()
              )`,
              [
                { name: 'conversationId', value: { stringValue: conversationId } },
                { name: 'role', value: { stringValue: 'assistant' } },
                { name: 'content', value: { stringValue: text || '' } },
                { name: 'modelId', value: { longValue: dbModelId } },
                { name: 'tokenUsage', value: { stringValue: JSON.stringify(usage || {}) } },
                { name: 'finishReason', value: { stringValue: finishReason || 'stop' } },
                { name: 'metadata', value: { stringValue: JSON.stringify({}) } }
              ]
            );
            
            // Update conversation statistics
            const totalTokens = usage?.totalTokens || 0;
            await executeSQL(
              `UPDATE nexus_conversations 
               SET last_message_at = NOW(), 
                   message_count = message_count + 1,
                   total_tokens = total_tokens + :tokens,
                   updated_at = NOW()
               WHERE id = :conversationId::uuid`,
              [
                { name: 'conversationId', value: { stringValue: conversationId } },
                { name: 'tokens', value: { longValue: totalTokens } }
              ]
            );
            
            log.info('Assistant message saved successfully', sanitizeForLogging({
              conversationId
            }));
          } catch (saveError) {
            log.error('Failed to save assistant message', sanitizeForLogging({
              error: saveError instanceof Error ? saveError.message : String(saveError),
              conversationId
            }));
            // Error is logged but not thrown to avoid breaking the stream
          }
          
          timer({ 
            status: 'success',
            conversationId,
            tokensUsed: usage?.totalTokens
          });
        }
      }
    };
    
    log.info('About to call streaming service', sanitizeForLogging({
      hasStreamRequest: !!streamRequest,
      hasMessages: !!streamRequest.messages,
      messageCount: streamRequest.messages?.length
    }));
    
    const streamResponse = await unifiedStreamingService.stream(streamRequest);
    
    // Return unified streaming response
    log.info('Returning unified streaming response', sanitizeForLogging({
      conversationId,
      requestId
    }));
    
    // Send conversation ID and title headers for new conversations
    const responseHeaders: Record<string, string> = {
      'X-Request-Id': requestId,
      'X-Unified-Streaming': 'true'
    };
    
    if (!existingConversationId && conversationId) {
      responseHeaders['X-Conversation-Id'] = conversationId;
      // Also send the title so the client can update the thread metadata
      responseHeaders['X-Conversation-Title'] = conversationTitle || 'New Conversation';
    }
    
    return streamResponse.result.toUIMessageStreamResponse({
      headers: responseHeaders
    });
    
  } catch (error) {
    log.error('Nexus chat API error', { 
      error: error instanceof Error ? {
        message: error.message,
        name: error.name,
        stack: error.stack
      } : String(error)
    });
    
    timer({ status: 'error' });
    
    // Return generic error response
    return new Response(
      JSON.stringify({
        error: 'Failed to process chat request',
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