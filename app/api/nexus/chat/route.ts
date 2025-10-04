import { UIMessage } from 'ai';
import { z } from 'zod';
import { getServerSession } from '@/lib/auth/server-session';
import { getCurrentUserAction } from '@/actions/db/get-current-user-action';
import { createLogger, generateRequestId, startTimer, sanitizeForLogging } from '@/lib/logger';
import { executeSQL } from '@/lib/db/data-api-adapter';
import { buildToolsForRequest } from '@/lib/tools/tool-registry';
import { processMessagesWithAttachments } from '@/lib/services/attachment-storage-service';
import { unifiedStreamingService } from '@/lib/streaming/unified-streaming-service';
import type { StreamRequest } from '@/lib/streaming/types';

// Allow streaming responses up to 5 minutes for long-running conversations
export const maxDuration = 300;

// Basic input validation schema - keeping it minimal to avoid breaking existing data flows
const ChatRequestSchema = z.object({
  messages: z.array(z.any()), // Keep flexible for UI message format
  modelId: z.string(),
  provider: z.string().optional(),
  conversationId: z.string().optional(),
  enabledTools: z.array(z.string()).optional(),
  reasoningEffort: z.enum(['minimal', 'low', 'medium', 'high']).optional(),
  responseMode: z.enum(['standard', 'priority', 'flex']).optional()
});

/**
 * Nexus Chat API - Native Streaming with AI SDK v5
 * Migrated from polling architecture to direct streaming for better performance
 */
export async function POST(req: Request) {
  const requestId = generateRequestId();
  const timer = startTimer('api.nexus.chat');
  const log = createLogger({ requestId, route: 'api.nexus.chat' });

  log.info('POST /api/nexus/chat - Processing chat request with native streaming');

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
      `SELECT id, provider, model_id, nexus_capabilities, chat_enabled
       FROM ai_models
       WHERE model_id = :modelId
       AND active = true
       LIMIT 1`,
      [{ name: 'modelId', value: { stringValue: modelId } }]
    );

    if (modelResult.length === 0) {
      log.error('Model not found', { modelId });
      return new Response(
        JSON.stringify({ error: 'Selected model not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const modelConfig = modelResult[0];
    const dbModelId = modelConfig.id as number;
    const capabilities = typeof modelConfig.nexusCapabilities === 'string'
      ? (() => {
          try {
            return JSON.parse(modelConfig.nexusCapabilities);
          } catch (error) {
            log.error('Failed to parse nexus capabilities', {
              modelId,
              capabilities: modelConfig.nexusCapabilities,
              error: error instanceof Error ? error.message : String(error)
            });
            return null;
          }
        })()
      : modelConfig.nexusCapabilities;
    const isImageGenerationModel = capabilities?.imageGeneration === true;
    const isChatEnabled = modelConfig.chatEnabled || modelConfig.chat_enabled;

    // Image generation models don't need chat_enabled=true since they work differently
    if (!isImageGenerationModel && !isChatEnabled) {
      log.error('Model not enabled for chat', { modelId, isChatEnabled });
      return new Response(
        JSON.stringify({ error: 'Selected model not enabled for chat' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    log.info('Model configured', sanitizeForLogging({
      provider: modelConfig.provider,
      modelId: modelConfig.model_id,
      dbId: dbModelId,
      isImageGeneration: isImageGenerationModel,
      isChatEnabled
    }));

    // 5. Handle image generation models separately (not via streaming)
    if (isImageGenerationModel) {
      log.info('Image generation model detected - using direct API call');

      // Extract prompt from the last user message
      const lastMessage = messages[messages.length - 1];
      let imagePrompt = '';

      if (lastMessage && lastMessage.role === 'user') {
        const messageContent = (lastMessage as UIMessage & {
          content?: string | Array<{ type: string; text?: string }>
        }).content;

        if (typeof messageContent === 'string') {
          imagePrompt = messageContent.trim();
        } else if (Array.isArray(messageContent)) {
          const textPart = messageContent.find(part => part.type === 'text' && part.text);
          imagePrompt = (textPart?.text || '').trim();
        } else if (lastMessage.parts && Array.isArray(lastMessage.parts)) {
          const textPart = lastMessage.parts.find((part: { type: string; text?: string }) => part.type === 'text' && part.text);
          imagePrompt = (textPart?.text || '').trim();
        }
      }

      // Validate prompt
      if (imagePrompt.length === 0) {
        return new Response(
          JSON.stringify({ error: 'Image generation requires a text prompt' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (imagePrompt.length > 4000) {
        return new Response(
          JSON.stringify({
            error: 'Image prompt is too long. Maximum 4000 characters allowed.',
            maxLength: 4000,
            currentLength: imagePrompt.length
          }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // Content policy validation
      const lowercasePrompt = imagePrompt.toLowerCase();
      const forbiddenPatterns = [
        'nude', 'naked', 'nsfw', 'explicit', 'sexual', 'porn', 'erotic',
        'violence', 'blood', 'gore', 'weapon', 'harm', 'kill', 'death',
        'hate', 'racist', 'discriminatory', 'offensive'
      ];

      if (forbiddenPatterns.some(pattern => lowercasePrompt.includes(pattern))) {
        return new Response(
          JSON.stringify({
            error: 'Image prompt violates content policy. Please revise your request.'
          }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // TODO: Implement actual image generation
      // This would call the OpenAI DALL-E API or equivalent
      // For now, return error indicating feature not yet implemented in streaming mode
      return new Response(
        JSON.stringify({
          error: 'Image generation via streaming is not yet implemented. Please use the legacy endpoint.',
          suggestion: 'Image generation support will be added in a future update.'
        }),
        { status: 501, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 6. Handle conversation (create new or use existing)
    let conversationId: string = existingConversationId || '';
    let conversationTitle = 'New Conversation';

    if (!conversationId) {
      // Generate a title from the first user message
      const firstUserMessage = messages.find(m => m.role === 'user');
      if (firstUserMessage) {
        // Extract text content for title generation
        let messageText = '';

        // Handle both legacy content format and new parts format
        const messageWithContent = firstUserMessage as UIMessage & {
          content?: string | Array<{ type: string; text?: string }>;
          parts?: Array<{ type: string; text?: string; [key: string]: unknown }>;
        };

        // Check if message has parts (new format)
        if (messageWithContent.parts && Array.isArray(messageWithContent.parts)) {
          const textPart = messageWithContent.parts.find((part): part is { type: 'text'; text: string } =>
            part.type === 'text' && typeof (part as Record<string, unknown>).text === 'string'
          );
          if (textPart?.text) {
            messageText = textPart.text;
          }
        }
        // Fallback to legacy content format
        else if (messageWithContent.content) {
          if (typeof messageWithContent.content === 'string') {
            messageText = messageWithContent.content;
          } else if (Array.isArray(messageWithContent.content)) {
            const textPart = messageWithContent.content.find(part => part.type === 'text' && part.text);
            if (textPart?.text) {
              messageText = textPart.text;
            }
          }
        }

        // Generate a concise title (max 40 chars)
        if (messageText) {
          // Remove newlines and extra whitespace for header compatibility
          const cleanedText = messageText.replace(/\s+/g, ' ').trim();
          conversationTitle = cleanedText.slice(0, 40).trim();
          if (cleanedText.length > 40) {
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
          { name: 'metadata', value: { stringValue: JSON.stringify({ source: 'nexus', streaming: true }) } }
        ]
      );

      conversationId = createResult[0].id as string;

      log.info('Created new Nexus conversation', sanitizeForLogging({
        conversationId,
        userId,
        title: conversationTitle
      }));
    }

    // 7. Save user message to nexus_messages
    const lastMessage = messages[messages.length - 1];
    if (lastMessage && lastMessage.role === 'user') {
      // Extract text content from message
      let userContent = '';
      let serializableParts: unknown[] = [];

      // Handle both legacy content format and new parts format
      const messageWithContent = lastMessage as UIMessage & {
        content?: string | Array<{ type: string; text?: string; image?: string }>;
        parts?: Array<{ type: string; text?: string; image?: string; [key: string]: unknown }>;
      };

      // Check if message has parts (new format)
      if (messageWithContent.parts && Array.isArray(messageWithContent.parts)) {
        messageWithContent.parts.forEach((part) => {
          const typedPart = part as Record<string, unknown>;
          if (part.type === 'text' && typeof typedPart.text === 'string') {
            userContent += (userContent ? ' ' : '') + typedPart.text;
            serializableParts.push({ type: 'text', text: typedPart.text });
          } else if (typedPart.type === 'image' && typedPart.image) {
            // Store only boolean flag - no image data or prefixes
            serializableParts.push({
              type: 'image',
              metadata: {
                hasImage: true
              }
            });
          }
        });
      }
      // Fallback to legacy content format
      else if (messageWithContent.content) {
        if (typeof messageWithContent.content === 'string') {
          userContent = messageWithContent.content;
          serializableParts = [{ type: 'text', text: messageWithContent.content }];
        } else if (Array.isArray(messageWithContent.content)) {
          messageWithContent.content.forEach((part) => {
            if (part.type === 'text' && part.text) {
              userContent += (userContent ? ' ' : '') + part.text;
              serializableParts.push({ type: 'text', text: part.text });
            } else if (part.type === 'image' && part.image) {
              serializableParts.push({
                type: 'image',
                metadata: {
                  hasImage: true
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

    // 8. Build tools based on model capabilities and user selection
    log.info('Building tools for request', sanitizeForLogging({
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

    // 9. Build system prompt (optional, can add Nexus-specific context here)
    const systemPrompt = `You are a helpful AI assistant in the Nexus interface.`;

    // 10. Convert messages to AI SDK v5 format (parts array) before processing attachments
    const messagesWithParts: UIMessage[] = messages.map(message => {
      // If message already has parts, use as-is
      if (message.parts) {
        return message;
      }

      // Convert legacy content format to parts format
      const messageContent = (message as UIMessage & {
        content?: string | Array<{ type: string; text?: string; image?: string }>
      }).content;

      if (typeof messageContent === 'string') {
        return {
          ...message,
          parts: [{ type: 'text', text: messageContent }]
        };
      } else if (Array.isArray(messageContent)) {
        return {
          ...message,
          parts: messageContent
        };
      } else {
        return {
          ...message,
          parts: []
        };
      }
    });

    // 11. Process messages to store attachments in S3 and create lightweight versions
    const { lightweightMessages } = await processMessagesWithAttachments(
      conversationId,
      messagesWithParts
    );

    // 12. Use unified streaming service (same as /api/chat)
    log.info('Starting unified streaming service', {
      provider: modelConfig.provider,
      model: modelConfig.model_id,
      conversationId
    });

    // Create streaming request with callbacks
    const streamRequest: StreamRequest = {
      messages: lightweightMessages as UIMessage[],
      modelId: modelConfig.model_id as string,
      provider: modelConfig.provider as string,
      userId: userId.toString(),
      sessionId: session.sub,
      conversationId,
      source: 'chat', // Using 'chat' as source since 'nexus' is not in the type
      systemPrompt,
      tools,
      options: {
        reasoningEffort: validationResult.data.reasoningEffort || 'medium',
        responseMode: validationResult.data.responseMode || 'standard'
      },
      callbacks: {
        onFinish: async ({ text, usage, finishReason }) => {
          log.info('Stream finished, saving assistant message', {
            conversationId,
            hasText: !!text,
            textLength: text?.length || 0,
            hasUsage: !!usage,
            finishReason
          });

          try {
            // Save assistant message to nexus_messages
            if (!text || text.length === 0) {
              log.warn('No text content to save for assistant message');
              return;
            }

            await executeSQL(
              `INSERT INTO nexus_messages (
                conversation_id, role, content, parts,
                model_id, token_usage, finish_reason, metadata,
                created_at, updated_at
              ) VALUES (
                :conversationId::uuid, 'assistant', :content, :parts::jsonb,
                :modelId, :tokenUsage::jsonb, :finishReason, '{}'::jsonb,
                NOW(), NOW()
              )`,
              [
                { name: 'conversationId', value: { stringValue: conversationId } },
                { name: 'content', value: { stringValue: text } },
                { name: 'parts', value: { stringValue: JSON.stringify([{ type: 'text', text }]) } },
                { name: 'modelId', value: { longValue: dbModelId } },
                { name: 'tokenUsage', value: {
                  stringValue: JSON.stringify({
                    promptTokens: usage?.promptTokens || 0,
                    completionTokens: usage?.completionTokens || 0,
                    totalTokens: usage?.totalTokens || 0
                  })
                }},
                { name: 'finishReason', value: { stringValue: finishReason || 'stop' } }
              ]
            );

            // Update conversation statistics
            await executeSQL(
              `UPDATE nexus_conversations
               SET message_count = message_count + 1,
                   total_tokens = total_tokens + :totalTokens,
                   last_message_at = NOW(),
                   updated_at = NOW()
               WHERE id = :conversationId::uuid`,
              [
                { name: 'conversationId', value: { stringValue: conversationId } },
                { name: 'totalTokens', value: { longValue: usage?.totalTokens || 0 } }
              ]
            );

            log.info('Assistant message saved successfully', {
              conversationId,
              textLength: text.length,
              totalTokens: usage?.totalTokens
            });
          } catch (saveError) {
            log.error('Failed to save assistant message', {
              error: saveError,
              conversationId,
              modelId: dbModelId
            });
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

    const streamResponse = await unifiedStreamingService.stream(streamRequest);

    // Return unified streaming response
    log.info('Returning unified streaming response', {
      conversationId,
      requestId,
      hasConversationId: !!conversationId,
      supportsReasoning: streamResponse.capabilities.supportsReasoning
    });

    // Set response headers
    const responseHeaders: Record<string, string> = {
      'X-Request-Id': requestId,
      'X-Unified-Streaming': 'true',
      'X-Supports-Reasoning': streamResponse.capabilities.supportsReasoning.toString()
    };

    // Only send conversation ID header for new conversations
    if (!existingConversationId && conversationId) {
      responseHeaders['X-Conversation-Id'] = conversationId;
      responseHeaders['X-Conversation-Title'] = encodeURIComponent(conversationTitle || 'New Conversation');
    }

    return streamResponse.result.toUIMessageStreamResponse({
      headers: responseHeaders
    });

  } catch (error) {
    log.error('Nexus chat API error', {
      error: error instanceof Error ? {
        message: error.message,
        name: error.name
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
