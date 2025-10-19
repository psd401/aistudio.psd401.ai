import { z } from 'zod';
import { UIMessage } from 'ai';
import { getServerSession } from '@/lib/auth/server-session';
import { getCurrentUserAction } from '@/actions/db/get-current-user-action';
import { getAssistantArchitectByIdAction } from '@/actions/db/assistant-architect-actions';
import { createLogger, generateRequestId, startTimer, sanitizeForLogging } from '@/lib/logger';
import { executeSQL } from '@/lib/db/data-api-adapter';
import { unifiedStreamingService } from '@/lib/streaming/unified-streaming-service';
import { retrieveKnowledgeForPrompt, formatKnowledgeContext } from '@/lib/assistant-architect/knowledge-retrieval';
import { hasToolAccess } from '@/utils/roles';
import { ErrorFactories } from '@/lib/error-utils';
import { createRepositoryTools } from '@/lib/tools/repository-tools';
import type { StreamRequest } from '@/lib/streaming/types';
import { storeExecutionEvent } from '@/lib/assistant-architect/event-storage';

// Allow streaming responses up to 15 minutes for long chains
export const maxDuration = 900;

// Constants for resource limits
const MAX_INPUT_SIZE_BYTES = 100000; // 100KB max input size
const MAX_INPUT_FIELDS = 50; // Max 50 input fields
const MAX_PROMPT_CHAIN_LENGTH = 20; // Max 20 prompts per execution

// Request validation schema
const ExecuteRequestSchema = z.object({
  toolId: z.number().positive(),
  inputs: z.record(z.string(), z.unknown())
    .refine(
      (inputs) => {
        const jsonSize = JSON.stringify(inputs).length;
        return jsonSize <= MAX_INPUT_SIZE_BYTES;
      },
      { message: `Input data exceeds maximum size of ${MAX_INPUT_SIZE_BYTES} bytes` }
    )
    .refine(
      (inputs) => Object.keys(inputs).length <= MAX_INPUT_FIELDS,
      { message: `Too many input fields (maximum ${MAX_INPUT_FIELDS})` }
    ),
  conversationId: z.string().uuid().optional()
});

interface ChainPrompt {
  id: number;
  name: string;
  content: string;
  systemContext: string | null;
  modelId: number | null;
  position: number;
  inputMapping: Record<string, string> | null;
  repositoryIds: number[] | null;
  enabledTools: string[] | null;
  timeoutSeconds: number | null;
}

interface PromptExecutionContext {
  previousOutputs: Map<number, string>;
  accumulatedMessages: UIMessage[];
  executionId: number;
  userCognitoSub: string;
  assistantOwnerSub?: string;
  userId: number;
  executionStartTime: number;
}

/**
 * Assistant Architect Execution API - Native SSE Streaming
 *
 * Replaces polling-based execution with native streaming, supporting:
 * - Multi-prompt sequential execution with state management
 * - Variable substitution between prompts
 * - Repository context injection (vector, keyword, hybrid search)
 * - Per-prompt tool configuration
 * - Database persistence via onFinish callbacks
 */
export async function POST(req: Request) {
  const requestId = generateRequestId();
  const timer = startTimer('api.assistant-architect.execute');
  const log = createLogger({ requestId, route: 'api.assistant-architect.execute' });

  log.info('POST /api/assistant-architect/execute - Processing execution request with streaming');

  try {
    // 1. Parse and validate request
    const body = await req.json();
    const validationResult = ExecuteRequestSchema.safeParse(body);

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

    const { toolId, inputs, conversationId } = validationResult.data;

    log.info('Request parsed', sanitizeForLogging({
      toolId,
      hasInputs: Object.keys(inputs).length > 0,
      inputKeys: Object.keys(inputs),
      conversationId
    }));

    // 2. Authenticate user
    const session = await getServerSession();
    if (!session) {
      log.warn('Unauthorized request - no session');
      timer({ status: 'error', reason: 'unauthorized' });
      return new Response('Unauthorized', { status: 401 });
    }

    log.debug('User authenticated', sanitizeForLogging({ userId: session.sub }));

    // 3. Check tool access permission
    const hasAccess = await hasToolAccess('assistant-architect');
    if (!hasAccess) {
      log.warn('User does not have assistant-architect tool access', { userId: session.sub });
      return new Response(
        JSON.stringify({
          error: 'Access denied',
          message: 'You do not have permission to use the Assistant Architect tool',
          requestId
        }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 4. Get current user
    const currentUser = await getCurrentUserAction();
    if (!currentUser.isSuccess) {
      log.error('Failed to get current user');
      return new Response('Unauthorized', { status: 401 });
    }

    const userId = currentUser.data.user.id;

    // 5. Load assistant architect configuration with prompts
    const architectResult = await getAssistantArchitectByIdAction(toolId.toString());
    if (!architectResult.isSuccess || !architectResult.data) {
      log.error('Assistant architect not found', { toolId });
      return new Response(
        JSON.stringify({
          error: 'Assistant architect not found',
          requestId
        }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const architect = architectResult.data;

    // SECURITY: Verify user has permission to execute this assistant architect
    // Currently only the owner can execute their assistant architects
    const isOwner = architect.userId === userId;

    if (!isOwner) {
      // Only owners can execute their assistant architects
      // TODO: Add assistant_architect_access table for sharing when implemented
      log.warn('User does not have access to this assistant architect', {
        userId,
        toolId,
        architectOwnerId: architect.userId
      });
      return new Response(
        JSON.stringify({
          error: 'Access denied',
          message: 'You do not have permission to execute this assistant architect',
          requestId
        }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const prompts = (architect.prompts || []).sort((a, b) => a.position - b.position);

    if (!prompts || prompts.length === 0) {
      log.error('No prompts configured for assistant architect', { toolId });
      return new Response(
        JSON.stringify({
          error: 'No prompts configured for this assistant architect',
          requestId
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Validate prompt chain length to prevent resource exhaustion
    if (prompts.length > MAX_PROMPT_CHAIN_LENGTH) {
      log.warn('Prompt chain too long', { promptCount: prompts.length, toolId, maxAllowed: MAX_PROMPT_CHAIN_LENGTH });
      return new Response(
        JSON.stringify({
          error: 'Prompt chain too long',
          message: `Maximum ${MAX_PROMPT_CHAIN_LENGTH} prompts allowed per execution`,
          requestId
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    log.info('Assistant architect loaded', sanitizeForLogging({
      toolId,
      name: architect.name,
      promptCount: prompts.length,
      userId
    }));

    // 6. Create tool_execution record
    const executionResult = await executeSQL<{ id: number }>(
      `INSERT INTO tool_executions (
        assistant_architect_id, user_id, input_data,
        status, started_at
      ) VALUES (
        :toolId, :userId, :inputData::jsonb,
        'running', NOW()
      ) RETURNING id`,
      [
        { name: 'toolId', value: { longValue: toolId } },
        { name: 'userId', value: { longValue: userId } },
        { name: 'inputData', value: { stringValue: JSON.stringify(inputs) } }
      ]
    );

    if (!executionResult || executionResult.length === 0 || !executionResult[0]?.id) {
      log.error('Failed to create tool execution', { toolId });
      return new Response(
        JSON.stringify({
          error: 'Failed to create execution record',
          requestId
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const executionId = Number(executionResult[0].id);
    log.info('Tool execution created', { executionId, toolId });

    // 7. Emit execution-start event
    await storeExecutionEvent(executionId, 'execution-start', {
      executionId,
      totalPrompts: prompts.length,
      toolName: architect.name
    });

    // 8. Execute prompt chain with streaming
    const context: PromptExecutionContext = {
      previousOutputs: new Map(),
      accumulatedMessages: [],
      executionId,
      userCognitoSub: session.sub,
      assistantOwnerSub: architect.userId ? String(architect.userId) : undefined,
      userId,
      executionStartTime: Date.now()
    };

    try {
      const streamResponse = await executePromptChain(prompts, inputs, context, requestId, log);

      // 9. Update execution status to completed on stream completion
      // This is done in the onFinish callback of the last prompt

      // Return SSE stream with headers
      log.info('Returning streaming response', {
        executionId,
        toolId,
        promptCount: prompts.length,
        requestId
      });

      return streamResponse.result.toUIMessageStreamResponse({
        headers: {
          'X-Execution-Id': executionId.toString(),
          'X-Tool-Id': toolId.toString(),
          'X-Prompt-Count': prompts.length.toString(),
          'X-Request-Id': requestId
        }
      });

    } catch (executionError) {
      // Update execution status to failed
      await executeSQL(
        `UPDATE tool_executions
         SET status = 'failed',
             error_message = :errorMessage,
             completed_at = NOW()
         WHERE id = :executionId`,
        [
          { name: 'executionId', value: { longValue: executionId } },
          { name: 'errorMessage', value: {
            stringValue: executionError instanceof Error ? executionError.message : String(executionError)
          }}
        ]
      );

      // Emit execution-error event
      await storeExecutionEvent(executionId, 'execution-error', {
        executionId,
        error: executionError instanceof Error ? executionError.message : String(executionError),
        recoverable: false,
        details: executionError instanceof Error ? executionError.stack : undefined
      }).catch(err => log.error('Failed to store execution-error event', { error: err }));

      throw executionError;
    }

  } catch (error) {
    log.error('Assistant architect execution error', {
      error: error instanceof Error ? {
        message: error.message,
        name: error.name,
        stack: error.stack
      } : String(error)
    });

    timer({ status: 'error' });

    return new Response(
      JSON.stringify({
        error: 'Failed to execute assistant architect',
        message: error instanceof Error ? error.message : 'Unknown error',
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
 * Execute a chain of prompts sequentially with state management
 * Now includes event emission for fine-grained progress tracking
 */
async function executePromptChain(
  prompts: ChainPrompt[],
  inputs: Record<string, unknown>,
  context: PromptExecutionContext,
  requestId: string,
  log: ReturnType<typeof createLogger>
) {
  log.info('Starting prompt chain execution', {
    promptCount: prompts.length,
    executionId: context.executionId
  });

  let lastStreamResponse;

  for (const [index, prompt] of prompts.entries()) {
    const isLastPrompt = index === prompts.length - 1;
    const promptStartTime = Date.now();
    const promptTimer = startTimer(`prompt.${prompt.id}.execution`);

    log.info('Executing prompt', {
      promptId: prompt.id,
      promptName: prompt.name,
      position: prompt.position,
      isLastPrompt,
      executionId: context.executionId
    });

    // Emit prompt-start event
    await storeExecutionEvent(context.executionId, 'prompt-start', {
      promptId: prompt.id,
      promptName: prompt.name,
      position: index + 1,
      totalPrompts: prompts.length,
      modelId: String(prompt.modelId || 'unknown'),
      hasKnowledge: !!(prompt.repositoryIds && prompt.repositoryIds.length > 0),
      hasTools: !!(prompt.enabledTools && prompt.enabledTools.length > 0)
    });

    try {
      // Validate prompt has a model configured
      if (!prompt.modelId) {
        throw ErrorFactories.validationFailed([{
          field: 'modelId',
          message: `Prompt ${prompt.id} (${prompt.name}) has no model configured`
        }], {
          details: { promptId: prompt.id, promptName: prompt.name }
        });
      }

      // 1. Inject repository context if configured
      let repositoryContext = '';
      if (prompt.repositoryIds && prompt.repositoryIds.length > 0) {
        log.debug('Retrieving repository knowledge', {
          promptId: prompt.id,
          repositoryIds: prompt.repositoryIds
        });

        // Emit knowledge-retrieval-start event
        await storeExecutionEvent(context.executionId, 'knowledge-retrieval-start', {
          promptId: prompt.id,
          repositories: prompt.repositoryIds,
          searchType: 'hybrid'
        });

        const knowledgeChunks = await retrieveKnowledgeForPrompt(
          prompt.content,
          prompt.repositoryIds,
          context.userCognitoSub,
          context.assistantOwnerSub,
          {
            maxChunks: 10,
            maxTokens: 4000,
            similarityThreshold: 0.7,
            searchType: 'hybrid',
            vectorWeight: 0.8
          },
          requestId
        );

        if (knowledgeChunks.length > 0) {
          repositoryContext = '\n\n' + formatKnowledgeContext(knowledgeChunks);
          log.debug('Repository context retrieved', {
            promptId: prompt.id,
            chunkCount: knowledgeChunks.length
          });

          // Emit knowledge-retrieved event
          // Calculate approximate tokens (chunk.content length / 4 is a rough estimate)
          const totalTokens = knowledgeChunks.reduce((sum, chunk) => sum + Math.ceil(chunk.content.length / 4), 0);
          // Use similarity score as relevance
          const avgRelevance = knowledgeChunks.reduce((sum, chunk) => sum + chunk.similarity, 0) / knowledgeChunks.length;

          await storeExecutionEvent(context.executionId, 'knowledge-retrieved', {
            promptId: prompt.id,
            documentsFound: knowledgeChunks.length,
            relevanceScore: avgRelevance,
            tokens: totalTokens
          });
        }
      }

      // 2. Apply variable substitution
      const inputMapping = (prompt.inputMapping || {}) as Record<string, string>;
      const processedContent = substituteVariables(
        prompt.content,
        inputs,
        context.previousOutputs,
        inputMapping
      );

      log.debug('Variables substituted', {
        promptId: prompt.id,
        originalLength: prompt.content.length,
        processedLength: processedContent.length
      });

      // Emit variable-substitution event if variables were used
      if (Object.keys(inputMapping).length > 0 || processedContent !== prompt.content) {
        const substitutedVars: Record<string, string> = {};
        const sourcePrompts: number[] = [];

        // Extract which variables were substituted
        Object.entries(inputMapping).forEach(([varName, mappedPath]) => {
          const promptMatch = mappedPath.match(/^prompt_(\d+)\.output$/);
          if (promptMatch) {
            const sourcePromptId = parseInt(promptMatch[1], 10);
            sourcePrompts.push(sourcePromptId);
            const value = context.previousOutputs.get(sourcePromptId);
            if (value) {
              substitutedVars[varName] = value.substring(0, 100); // Truncate for storage
            }
          } else if (varName in inputs) {
            substitutedVars[varName] = String(inputs[varName]).substring(0, 100);
          }
        });

        await storeExecutionEvent(context.executionId, 'variable-substitution', {
          promptId: prompt.id,
          variables: substitutedVars,
          sourcePrompts: Array.from(new Set(sourcePrompts))
        });
      }

      // 3. Build messages with accumulated context
      const userMessage: UIMessage = {
        id: `prompt-${prompt.id}-${Date.now()}`,
        role: 'user',
        parts: [{ type: 'text', text: processedContent + repositoryContext }]
      };

      const messages = [...context.accumulatedMessages, userMessage];

      // 4. Get AI model configuration
      // Note: RDS Data API adapter returns camelCase field names
      const modelResult = await executeSQL<{ modelId: string; provider: string }>(
        `SELECT model_id, provider FROM ai_models WHERE id = :modelId LIMIT 1`,
        [{ name: 'modelId', value: { longValue: prompt.modelId } }]
      );

      if (!modelResult || modelResult.length === 0) {
        throw ErrorFactories.dbRecordNotFound('ai_models', prompt.modelId || 'unknown', {
          details: { promptId: prompt.id, modelId: prompt.modelId }
        });
      }

      // Validate query results to ensure correct types
      // Note: RDS Data API adapter transforms snake_case to camelCase
      const modelData = modelResult[0];
      if (!modelData?.modelId || !modelData?.provider) {
        throw ErrorFactories.dbRecordNotFound('ai_models', prompt.modelId || 'unknown', {
          details: { promptId: prompt.id, modelId: prompt.modelId, reason: 'Invalid model data' }
        });
      }

      const modelId = String(modelData.modelId);
      const provider = String(modelData.provider);

      // 5. Prepare tools for this prompt
      const enabledTools: string[] = [...(prompt.enabledTools || [])];
      let promptTools = {};

      // Create repository search tools if repositories are configured
      if (prompt.repositoryIds && prompt.repositoryIds.length > 0) {
        log.debug('Creating repository search tools', {
          promptId: prompt.id,
          repositoryIds: prompt.repositoryIds
        });

        const repoTools = createRepositoryTools({
          repositoryIds: prompt.repositoryIds,
          userCognitoSub: context.userCognitoSub,
          assistantOwnerSub: context.assistantOwnerSub
        });

        // Merge repository tools
        promptTools = { ...promptTools, ...repoTools };
      }

      log.debug('Tools configured for prompt', {
        promptId: prompt.id,
        enabledTools,
        toolCount: Object.keys(promptTools).length,
        tools: Object.keys(promptTools)
      });

      // 6. Create streaming request
      const streamRequest: StreamRequest = {
        messages,
        modelId: String(modelId),
        provider: String(provider),
        userId: context.userId.toString(),
        sessionId: context.userCognitoSub,
        conversationId: undefined, // Assistant architect doesn't use conversations
        source: 'assistant_execution' as const,
        systemPrompt: prompt.systemContext || undefined,
        enabledTools, // Keep for backward compatibility with other tools
        tools: Object.keys(promptTools).length > 0 ? promptTools : undefined, // Repository search tools
        callbacks: {
          onFinish: async ({ text, usage, finishReason }) => {

            log.info('Prompt execution finished', {
              promptId: prompt.id,
              promptName: prompt.name,
              hasText: !!text,
              textLength: text?.length || 0,
              hasUsage: !!usage,
              finishReason,
              executionId: context.executionId
            });

            try {
              // Calculate execution time as milliseconds
              const executionTimeMs = Date.now() - promptStartTime;

              // Log completion
              promptTimer({
                status: 'success',
                tokensUsed: usage?.totalTokens
              });

              // Save prompt result
              if (!text || text.length === 0) {
                log.warn('No text content from prompt execution', { promptId: prompt.id });
              }

              await executeSQL(
                `INSERT INTO prompt_results (
                  execution_id, prompt_id, input_data, output_data,
                  status, started_at, completed_at, execution_time_ms
                ) VALUES (
                  :executionId, :promptId, :inputData::jsonb, :outputData,
                  'completed', NOW() - INTERVAL '1 millisecond' * :executionTimeMs, NOW(), :executionTimeMs
                )`,
                [
                  { name: 'executionId', value: { longValue: context.executionId } },
                  { name: 'promptId', value: { longValue: prompt.id } },
                  { name: 'inputData', value: { stringValue: JSON.stringify({
                    originalContent: prompt.content,
                    processedContent,
                    repositoryContext: repositoryContext ? 'included' : 'none'
                  }) } },
                  { name: 'outputData', value: { stringValue: text || '' } },
                  { name: 'executionTimeMs', value: { longValue: executionTimeMs } }
                ]
              );

              // Store output for next prompt's variable substitution
              context.previousOutputs.set(prompt.id, text || '');

              // Accumulate messages for context (only include reasonable text)
              const assistantMessage: UIMessage = {
                id: `assistant-${prompt.id}-${Date.now()}`,
                role: 'assistant',
                parts: [{ type: 'text', text: text || '' }]
              };
              context.accumulatedMessages.push(userMessage, assistantMessage);

              log.info('Prompt result saved successfully', {
                promptId: prompt.id,
                executionId: context.executionId,
                outputLength: text?.length || 0,
                executionTimeMs
              });

              // Emit prompt-complete event
              await storeExecutionEvent(context.executionId, 'prompt-complete', {
                promptId: prompt.id,
                outputTokens: usage?.completionTokens || 0,
                duration: executionTimeMs,
                cached: false // TODO: detect if response was cached
              }).catch(err => log.error('Failed to store prompt-complete event', { error: err }));

              // If this is the last prompt, update execution status to completed
              if (isLastPrompt) {
                await executeSQL(
                  `UPDATE tool_executions
                   SET status = 'completed',
                       completed_at = NOW()
                   WHERE id = :executionId`,
                  [{ name: 'executionId', value: { longValue: context.executionId } }]
                );

                // Emit execution-complete event
                const totalDuration = Date.now() - context.executionStartTime;
                await storeExecutionEvent(context.executionId, 'execution-complete', {
                  executionId: context.executionId,
                  totalTokens: usage?.totalTokens || 0,
                  duration: totalDuration,
                  success: true
                }).catch(err => log.error('Failed to store execution-complete event', { error: err }));

                log.info('Execution completed successfully', {
                  executionId: context.executionId,
                  totalPrompts: prompts.length
                });
              }

            } catch (saveError) {
              log.error('Failed to save prompt result', {
                error: saveError,
                promptId: prompt.id,
                executionId: context.executionId
              });
              // Don't throw - let the stream complete, but log the error
            }
          }
        }
      };

      // 7. Execute prompt with streaming
      lastStreamResponse = await unifiedStreamingService.stream(streamRequest);

      log.info('Prompt streamed successfully', {
        promptId: prompt.id,
        promptName: prompt.name,
        position: index + 1,
        of: prompts.length
      });

    } catch (promptError) {
      promptTimer({ status: 'error' });

      log.error('Prompt execution failed', {
        error: promptError,
        promptId: prompt.id,
        promptName: prompt.name,
        executionId: context.executionId
      });

      // Emit execution-error event for prompt failure
      await storeExecutionEvent(context.executionId, 'execution-error', {
        executionId: context.executionId,
        error: promptError instanceof Error ? promptError.message : String(promptError),
        promptId: prompt.id,
        recoverable: false,
        details: promptError instanceof Error ? promptError.stack : undefined
      }).catch(err => log.error('Failed to store prompt error event', { error: err }));

      // Save failed prompt result
      await executeSQL(
        `INSERT INTO prompt_results (
          execution_id, prompt_id, input_data, output_data,
          status, error_message, started_at, completed_at
        ) VALUES (
          :executionId, :promptId, :inputData::jsonb, :outputData,
          'failed', :errorMessage, NOW(), NOW()
        )`,
        [
          { name: 'executionId', value: { longValue: context.executionId } },
          { name: 'promptId', value: { longValue: prompt.id } },
          { name: 'inputData', value: { stringValue: JSON.stringify({ prompt: prompt.content }) } },
          { name: 'outputData', value: { stringValue: '' } },
          { name: 'errorMessage', value: {
            stringValue: promptError instanceof Error ? promptError.message : String(promptError)
          }}
        ]
      );

      // For now, stop execution on first error
      // Future enhancement: check prompt.stop_on_error field
      throw ErrorFactories.sysInternalError(
        `Prompt ${prompt.id} (${prompt.name}) failed: ${
          promptError instanceof Error ? promptError.message : String(promptError)
        }`,
        {
          details: { promptId: prompt.id, promptName: prompt.name },
          cause: promptError instanceof Error ? promptError : undefined
        }
      );
    }
  }

  if (!lastStreamResponse) {
    throw ErrorFactories.sysInternalError('No stream response generated', {
      details: { promptCount: prompts.length, executionId: context.executionId }
    });
  }

  return lastStreamResponse;
}

/**
 * Substitute {{variable}} placeholders in prompt content
 *
 * Supports:
 * - Direct input mapping: {{userInput}} -> inputs.userInput
 * - Mapped variables: {{topic}} with mapping {"topic": "userInput.subject"}
 * - Previous outputs: {{previousAnalysis}} with mapping {"previousAnalysis": "prompt_1.output"}
 */
function substituteVariables(
  content: string,
  inputs: Record<string, unknown>,
  previousOutputs: Map<number, string>,
  mapping: Record<string, string>
): string {
  return content.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
    // 1. Check if there's an input mapping for this variable
    if (mapping[varName]) {
      const mappedPath = mapping[varName];

      // Handle prompt output references: "prompt_X.output"
      const promptMatch = mappedPath.match(/^prompt_(\d+)\.output$/);
      if (promptMatch) {
        const promptId = parseInt(promptMatch[1], 10);
        const output = previousOutputs.get(promptId);
        if (output) {
          return output;
        }
      }

      // Handle nested input paths: "userInput.subject"
      const value = resolvePath(mappedPath, { inputs, previousOutputs });
      if (value !== undefined && value !== null) {
        return String(value);
      }
    }

    // 2. Try direct input lookup
    if (varName in inputs) {
      const value = inputs[varName];
      return value !== undefined && value !== null ? String(value) : match;
    }

    // 3. No match found, return original placeholder
    return match;
  });
}

/**
 * Resolve a dot-notation path like "userInput.subject" or "prompt_1.output"
 */
function resolvePath(
  path: string,
  context: { inputs: Record<string, unknown>; previousOutputs: Map<number, string> }
): unknown {
  const parts = path.split('.');
  let current: unknown = context;

  for (const part of parts) {
    if (current && typeof current === 'object') {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }

  return current;
}
