import { UIMessage } from 'ai';
import { z } from 'zod';
import { getServerSession } from '@/lib/auth/server-session';
import { getCurrentUserAction } from '@/actions/db/get-current-user-action';
import { createLogger, generateRequestId, startTimer, sanitizeForLogging } from '@/lib/logger';
import { executeSQL } from '@/lib/db/data-api-adapter';
import { buildToolsForRequest } from '@/lib/tools/tool-registry';
import { jobManagementService } from '@/lib/streaming/job-management-service';
import type { CreateJobRequest } from '@/lib/streaming/job-management-service';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { ErrorFactories } from '@/lib/error-utils';
import { getStreamingJobsQueueUrl } from '@/lib/aws/queue-config';
import { processMessagesWithAttachments } from '@/lib/services/attachment-storage-service';

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

// SQS client for sending jobs to worker queue with explicit configuration
const sqsClient = new SQSClient({
  region: process.env.NEXT_PUBLIC_AWS_REGION || process.env.AWS_REGION || 'us-east-1'
});

// Queue URL is now handled by the queue configuration service

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
    
    // 5. Handle conversation (create new or use existing)
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
                // No image data or prefixes stored for security/memory reasons
              }
            });
          }
        });
      }
      // Fallback to legacy content format
      else if (messageWithContent.content) {
        if (typeof messageWithContent.content === 'string') {
          // Simple string content
          userContent = messageWithContent.content;
          serializableParts = [{ type: 'text', text: messageWithContent.content }];
        } else if (Array.isArray(messageWithContent.content)) {
          // Content parts array (includes attachments from assistant-ui)
          messageWithContent.content.forEach((part) => {
            if (part.type === 'text' && part.text) {
              userContent += (userContent ? ' ' : '') + part.text;
              serializableParts.push({ type: 'text', text: part.text });
            } else if (part.type === 'image' && part.image) {
              // Store only boolean flag - no image data or prefixes
              serializableParts.push({ 
                type: 'image',
                metadata: {
                  hasImage: true
                  // No image data or prefixes stored for security/memory reasons
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
    
    // 9. Universal Polling Architecture - Create streaming job for all Nexus requests
    log.info('Creating streaming job for universal polling architecture', sanitizeForLogging({ 
      provider,
      model: modelId,
      conversationId,
      userId,
      toolsEnabled: Object.keys(tools).length > 0
    }));
    
    // Validate messages before creating job
    if (!messages || !Array.isArray(messages)) {
      log.error('Messages invalid before job creation', sanitizeForLogging({
        messagesProvided: !!messages,
        isArray: Array.isArray(messages),
        type: typeof messages
      }));
      return new Response(
        JSON.stringify({ error: 'Invalid messages array' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    // Prepare job creation request for Nexus
    let jobOptions: CreateJobRequest['options'] = {
      reasoningEffort: validationResult.data.reasoningEffort || 'medium',
      responseMode: validationResult.data.responseMode || 'standard'
    };

    // For any image generation model, set up image generation options
    if (isImageGenerationModel) {
      // Extract prompt from the last user message for image generation
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

      // Validate prompt length (reject if too long instead of truncating)
      if (imagePrompt.length > 4000) {
        log.warn('Image prompt exceeds maximum length', { 
          originalLength: imagePrompt.length,
          modelId,
          maxLength: 4000
        });
        return new Response(
          JSON.stringify({ 
            error: 'Image prompt is too long. Maximum 4000 characters allowed.',
            maxLength: 4000,
            currentLength: imagePrompt.length
          }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (imagePrompt.length === 0) {
        log.error('Empty image generation prompt');
        return new Response(
          JSON.stringify({ error: 'Image generation requires a text prompt' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // Basic content policy validation - reject obvious harmful requests
      const lowercasePrompt = imagePrompt.toLowerCase();
      const forbiddenPatterns = [
        'nude', 'naked', 'nsfw', 'explicit', 'sexual', 'porn', 'erotic',
        'violence', 'blood', 'gore', 'weapon', 'harm', 'kill', 'death',
        'hate', 'racist', 'discriminatory', 'offensive'
      ];
      
      const hasForbiddenContent = forbiddenPatterns.some(pattern => 
        lowercasePrompt.includes(pattern)
      );

      if (hasForbiddenContent) {
        log.warn('Image prompt violates content policy', {
          promptLength: imagePrompt.length,
          modelId
        });
        return new Response(
          JSON.stringify({ 
            error: 'Image prompt violates content policy. Please revise your request.' 
          }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }
      
      // Set image generation options for the worker
      jobOptions = {
        ...jobOptions,
        imageGeneration: {
          prompt: imagePrompt,
          size: '1024x1024', // Default size
          style: 'natural' // Default style
        }
      };
      
      log.info('Image generation job configured', sanitizeForLogging({
        modelId,
        promptLength: imagePrompt.length,
        size: jobOptions.imageGeneration?.size
      }));
    }

    // Convert messages to AI SDK v5 format (parts array) before processing attachments
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
        // Simple string content
        return {
          ...message,
          parts: [{ type: 'text', text: messageContent }]
        };
      } else if (Array.isArray(messageContent)) {
        // Content parts array - convert to parts format
        return {
          ...message,
          parts: messageContent
        };
      } else {
        // No content, create empty parts
        return {
          ...message,
          parts: []
        };
      }
    });

    // Process messages to store attachments in S3 and create lightweight versions
    const { lightweightMessages, attachmentReferences } = await processMessagesWithAttachments(
      conversationId,
      messagesWithParts
    );

    const jobRequest: CreateJobRequest = {
      conversationId: conversationId, // Keep as UUID string for nexus
      userId: userId,
      modelId: dbModelId,
      messages: lightweightMessages as UIMessage[], // Lightweight messages (attachments in S3)
      provider: provider,
      modelIdString: modelId,
      systemPrompt,
      options: jobOptions,
      maxTokens: undefined,
      temperature: undefined,
      tools,
      source: 'nexus',
      sessionId: session.sub
    };
    
    // Create the streaming job in database
    const jobId = await jobManagementService.createJob(jobRequest);
    
    log.info('Nexus streaming job created successfully', sanitizeForLogging({
      jobId,
      conversationId,
      requestId,
      provider,
      modelId
    }));
    
    // Send job to SQS queue for worker processing
    const queueUrl = getStreamingJobsQueueUrl();
    if (queueUrl) {
      try {
        const sqsCommand = new SendMessageCommand({
          QueueUrl: queueUrl,
          MessageBody: JSON.stringify({
            jobId,
            hasAttachments: attachmentReferences.length > 0,
            attachmentCount: attachmentReferences.length,
            attachmentReferences: attachmentReferences // S3 metadata for reconstruction
          }),
          MessageAttributes: {
            jobType: {
              DataType: 'String',
              StringValue: 'ai-streaming-nexus'
            },
            provider: {
              DataType: 'String',
              StringValue: provider
            },
            modelId: {
              DataType: 'String',
              StringValue: modelId
            },
            conversationId: {
              DataType: 'String',
              StringValue: conversationId
            },
            userId: {
              DataType: 'Number',
              StringValue: userId.toString()
            },
            source: {
              DataType: 'String',
              StringValue: 'nexus'
            }
          }
        });
        
        await sqsClient.send(sqsCommand);
        
        log.info('Nexus job sent to SQS queue successfully', sanitizeForLogging({
          jobId,
          messageAttributes: sqsCommand.input.MessageAttributes
        }));
      } catch (sqsError) {
        log.error('Failed to send Nexus job to SQS queue', sanitizeForLogging({
          jobId,
          error: sqsError instanceof Error ? sqsError.message : String(sqsError)
        }));
        
        // Mark job as failed if we can't queue it
        try {
          await jobManagementService.failJob(jobId, `Failed to queue job: ${sqsError}`);
        } catch (failError) {
          log.error('Failed to mark job as failed', { jobId, error: failError });
        }
        
        throw ErrorFactories.externalServiceError('SQS', new Error('Failed to queue streaming job for processing'));
      }
    } else {
      log.warn('No SQS queue URL configured for Nexus, job created but not queued', { jobId });
    }
    
    // Return job information for client polling
    const responseHeaders: Record<string, string> = {
      'X-Request-Id': requestId,
      'X-Job-Id': jobId,
      'X-Universal-Polling': 'true',
      'Content-Type': 'application/json'
    };
    
    if (!existingConversationId && conversationId) {
      responseHeaders['X-Conversation-Id'] = conversationId;
      responseHeaders['X-Conversation-Title'] = encodeURIComponent(conversationTitle || 'New Conversation');
    }
    
    timer({ 
      status: 'success',
      jobId,
      conversationId,
      operation: 'job_created'
    });
    
    return new Response(JSON.stringify({
      jobId,
      conversationId,
      status: 'pending',
      message: 'Nexus streaming job created successfully. Use the job ID to poll for results.',
      requestId,
      ...(conversationTitle && !existingConversationId ? { title: conversationTitle } : {})
    }), {
      status: 202, // Accepted - processing asynchronously
      headers: responseHeaders
    });
    
  } catch (error) {
    log.error('Nexus chat API error', { 
      error: error instanceof Error ? {
        message: error.message,
        name: error.name
        // Stack traces removed for security - internal paths not exposed in logs
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