import { UIMessage } from 'ai';
import { getServerSession } from '@/lib/auth/server-session';
import { getCurrentUserAction } from '@/actions/db/get-current-user-action';
import { createLogger, generateRequestId, startTimer } from '@/lib/logger';
import { ErrorFactories } from '@/lib/error-utils';
import { buildSystemPrompt } from './lib/system-prompt-builder';
import { 
  handleConversation,
  getModelConfig,
  getConversationContext 
} from './lib/conversation-handler';
import { loadExecutionContextData, buildInitialPromptForStreaming } from './lib/execution-context';
import { getAssistantOwnerSub } from './lib/knowledge-context';
import { jobManagementService } from '@/lib/streaming/job-management-service';
import type { CreateJobRequest } from '@/lib/streaming/job-management-service';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

// SQS client for sending jobs to worker queue
const sqsClient = new SQSClient({});

// Get streaming jobs queue URL from environment
const getStreamingJobsQueueUrl = () => {
  // In production, this would be set by CDK outputs or SSM Parameter Store
  // For now, we'll construct it based on environment
  const environment = process.env.NEXT_PUBLIC_ENVIRONMENT || 'dev';
  const region = process.env.AWS_REGION || 'us-east-1';
  const account = process.env.AWS_ACCOUNT_ID;
  
  if (account) {
    return `https://sqs.${region}.amazonaws.com/${account}/aistudio-${environment}-streaming-jobs-queue`;
  }
  
  // Fallback - would be replaced with actual queue URL from infrastructure
  return process.env.STREAMING_JOBS_QUEUE_URL || '';
};

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
    
    // 9. Universal Polling Architecture - Create streaming job for all requests
    log.info('Creating streaming job for universal polling architecture', { 
      provider: modelConfig.provider,
      model: modelConfig.model_id,
      conversationId,
      userId: currentUser.data.user.id
    });
    
    // Prepare job creation request
    const jobRequest: CreateJobRequest = {
      conversationId,
      userId: currentUser.data.user.id,
      modelId: modelConfig.id,
      messages: processedMessages,
      provider: modelConfig.provider,
      modelIdString: modelConfig.model_id,
      systemPrompt,
      options: {
        reasoningEffort: body.reasoningEffort || 'medium',
        responseMode: body.responseMode || 'standard'
      },
      maxTokens: undefined,
      temperature: undefined,
      tools: undefined,
      source: 'chat',
      sessionId: session.sub
    };
    
    // Create the streaming job in database
    const jobId = await jobManagementService.createJob(jobRequest);
    
    log.info('Streaming job created successfully', {
      jobId,
      conversationId,
      requestId,
      provider: modelConfig.provider,
      modelId: modelConfig.model_id
    });
    
    // Send job to SQS queue for worker processing
    const queueUrl = getStreamingJobsQueueUrl();
    if (queueUrl) {
      try {
        const sqsCommand = new SendMessageCommand({
          QueueUrl: queueUrl,
          MessageBody: jobId,
          MessageAttributes: {
            jobType: {
              DataType: 'String',
              StringValue: 'ai-streaming'
            },
            provider: {
              DataType: 'String',
              StringValue: modelConfig.provider
            },
            modelId: {
              DataType: 'String',
              StringValue: modelConfig.model_id
            },
            conversationId: {
              DataType: 'Number',
              StringValue: conversationId.toString()
            },
            userId: {
              DataType: 'Number', 
              StringValue: currentUser.data.user.id.toString()
            }
          }
        });
        
        await sqsClient.send(sqsCommand);
        
        log.info('Job sent to SQS queue successfully', {
          jobId,
          queueUrl,
          messageAttributes: sqsCommand.input.MessageAttributes
        });
      } catch (sqsError) {
        log.error('Failed to send job to SQS queue', {
          jobId,
          error: sqsError,
          queueUrl
        });
        
        // Mark job as failed if we can't queue it
        try {
          await jobManagementService.failJob(jobId, `Failed to queue job: ${sqsError}`);
        } catch (failError) {
          log.error('Failed to mark job as failed', { jobId, error: failError });
        }
        
        throw ErrorFactories.externalServiceError('SQS', new Error('Failed to queue streaming job for processing'));
      }
    } else {
      log.warn('No SQS queue URL configured, job created but not queued', { jobId });
    }
    
    // Return job information for client polling
    const responseHeaders: Record<string, string> = {
      'X-Request-Id': requestId,
      'X-Job-Id': jobId,
      'X-Universal-Polling': 'true',
      'Content-Type': 'application/json'
    };
    
    if (!existingConversationId) {
      responseHeaders['X-Conversation-Id'] = conversationId.toString();
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
      message: 'Streaming job created successfully. Use the job ID to poll for results.',
      requestId
    }), {
      status: 202, // Accepted - processing asynchronously
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