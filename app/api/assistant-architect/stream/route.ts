import { getServerSession } from "@/lib/auth/server-session";
import { executeSQL } from "@/lib/db/data-api-adapter";
import { createLogger, generateRequestId, startTimer } from "@/lib/logger";
import { ErrorFactories } from "@/lib/error-utils";
import { rateLimit } from "@/lib/rate-limit";
import { NextRequest } from 'next/server';
import { createProviderModel } from "@/app/api/chat/lib/provider-factory";
import { transformSnakeToCamel } from '@/lib/db/field-mapper';
import { streamText } from 'ai';

// Try static import again to see the actual error
import { retrieveKnowledgeForPrompt, formatKnowledgeContext } from "@/lib/assistant-architect/knowledge-retrieval";
import { parseRepositoryIds } from "@/lib/utils/repository-utils";

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

// Interface for the joined prompt + ai_model data
interface ChainPromptWithModel {
  id: number;
  assistantArchitectId: number;
  name: string;
  content: string;
  systemContext?: string | null;
  position: number;
  inputMapping?: unknown;
  repositoryIds?: string | number[] | null;
  createdAt: Date;
  updatedAt: Date;
  // Fields from the join with ai_models
  aiModelId: number;    // This is cp.model_id (foreign key)
  modelId: string;      // This is am.model_id (the actual model string like "gpt-5")
  provider: string;     // Provider name (e.g., "openai")
  modelName: string;    // Display name of the model
}

interface StreamRequest {
  toolId: number;
  executionId: number;
  inputs: Record<string, unknown>;
  promptIndex?: number; // For single prompt streaming
}

// Add a function to decode HTML entities and remove escapes for variable placeholders
function decodePromptVariables(content: string): string {
  // Replace HTML entity for $ with $
  let decoded = content.replace(/&#x24;|&#36;/g, '$');
  // Remove backslash escapes before $
  decoded = decoded.replace(/\\\$/g, '$');
  // Remove backslash escapes before {
  decoded = decoded.replace(/\\\{/g, '{');
  // Remove backslash escapes before }
  decoded = decoded.replace(/\\\}/g, '}');
  // Remove backslash escapes before _
  decoded = decoded.replace(/\\_/g, '_');
  return decoded;
}

// Configure rate limiting: 5 requests per minute per user
const limiter = rateLimit({
  interval: 60 * 1000, // 1 minute
  uniqueTokenPerInterval: 5, // 5 requests per minute
  skipAuth: false // Apply rate limiting to authenticated users
});

export async function POST(req: NextRequest) {
  const requestId = generateRequestId();
  const timer = startTimer("api.assistant-architect.stream");
  const log = createLogger({ requestId, route: "api.assistant-architect.stream" });
  
  log.info('POST /api/assistant-architect/stream - Processing stream request');
  
  // Apply rate limiting
  const rateLimitResponse = await limiter(req);
  if (rateLimitResponse) {
    log.warn("Rate limit exceeded");
    timer({ status: "error", reason: "rate_limited" });
    return rateLimitResponse;
  }

  const session = await getServerSession();
  if (!session) {
    log.warn("Unauthorized - No session");
    timer({ status: "error", reason: "unauthorized" });
    return new Response('Unauthorized', { status: 401, headers: { 'X-Request-Id': requestId } });
  }

  log.debug('Session authenticated', { sub: session.sub });

  try {
    const { toolId, executionId, inputs, promptIndex = 0 }: StreamRequest = await req.json();

    // Get tool configuration and prompts
    // Allow both approved tools and draft tools that belong to the current user
    const toolQuery = `
      SELECT aa.id, aa.name, aa.description, aa.status, aa.user_id
      FROM assistant_architects aa
      LEFT JOIN users u ON aa.user_id = u.id
      WHERE aa.id = :toolId 
        AND (aa.status = 'approved' 
          OR (aa.status = 'draft' AND u.cognito_sub = :userSub))
    `;
    const toolResult = await executeSQL(toolQuery, [
      { name: 'toolId', value: { longValue: toolId } },
      { name: 'userSub', value: { stringValue: session.sub } }
    ]);

    if (!toolResult.length) {
      log.warn("Tool not found or access denied", { toolId });
      timer({ status: "error", reason: "tool_not_found" });
      return new Response('Tool not found or you do not have access', { status: 404, headers: { 'X-Request-Id': requestId } });
    }

    const tool = toolResult[0] as { id: number; name: string; description: string; status: string; userId: number };

    // Get prompts for this tool
    const promptsQuery = `
      SELECT cp.id, cp.name, cp.content, cp.position, cp.model_id as ai_model_id,
             cp.system_context, cp.repository_ids,
             am.model_id, am.provider, am.name as model_name
      FROM chain_prompts cp
      JOIN ai_models am ON cp.model_id = am.id
      WHERE cp.assistant_architect_id = :toolId
      ORDER BY cp.position ASC
    `;
    const promptsRaw = await executeSQL(promptsQuery, [
      { name: 'toolId', value: { longValue: toolId } }
    ]);
    
    // Log the raw result structure for debugging
    if (promptsRaw.length > 0) {
      log.debug('Sample prompt raw data structure:', { 
        sampleKeys: Object.keys(promptsRaw[0]),
        firstPrompt: promptsRaw[0]
      });
    }
    
    // Use the standard field mapper to handle snake_case to camelCase conversion
    const prompts = promptsRaw.map((row: Record<string, unknown>) => {
      const transformed = transformSnakeToCamel<ChainPromptWithModel>(row);
      // Parse repository IDs after transformation
      transformed.repositoryIds = parseRepositoryIds(transformed.repositoryIds);
      return transformed;
    });

    if (!prompts.length) {
      log.warn("No prompts configured for tool", { toolId });
      timer({ status: "error", reason: "no_prompts" });
      return new Response('No prompts configured for this tool', { status: 400, headers: { 'X-Request-Id': requestId } });
    }

    // Get the current prompt to stream
    const prompt = prompts[promptIndex];
    if (!prompt) {
      log.warn("Prompt not found", { promptIndex });
      timer({ status: "error", reason: "prompt_not_found" });
      return new Response('Prompt not found', { status: 404, headers: { 'X-Request-Id': requestId } });
    }

    // Get tool executions record and check if it's already being processed
    const executionQuery = `
      SELECT id, status FROM tool_executions 
      WHERE id = :executionId
    `;
    const executionResultRaw = await executeSQL(executionQuery, [
      { name: 'executionId', value: { longValue: executionId } }
    ]);
    const executionResult = executionResultRaw as Array<{ id: number; status: string }>;

    if (!executionResult.length) {
      log.warn("Execution not found", { executionId });
      timer({ status: "error", reason: "execution_not_found" });
      return new Response('Execution not found', { status: 404, headers: { 'X-Request-Id': requestId } });
    }

    // Check if execution is already completed or failed
    if (executionResult[0].status === 'completed' || executionResult[0].status === 'failed') {
      log.warn("Execution already processed", { executionId, status: executionResult[0].status });
      timer({ status: "error", reason: "already_processed" });
      return new Response('Execution has already been processed', { status: 409, headers: { 'X-Request-Id': requestId } });
    }

    // If execution is pending, we need to mark it as running
    // This handles the case where streaming starts before the background job updates the status
    if (executionResult[0].status === 'pending') {
      try {
        await executeSQL(
          `UPDATE tool_executions 
           SET status = 'running'::execution_status,
               started_at = COALESCE(started_at, NOW())
           WHERE id = :executionId AND status = 'pending'::execution_status`,
          [
            { name: 'executionId', value: { longValue: executionId } }
          ]
        );
      } catch (error) {
        log.error('Failed to mark execution as running', error);
        // If we can't update the status, it might have been updated by another process
        // Continue anyway
      }
    }

    // Process prompt template with inputs
    let processedPrompt = prompt.content;
    
    if (!processedPrompt) {
      log.error(`[STREAM] Prompt content is empty for prompt ${promptIndex + 1}`);
      throw ErrorFactories.missingRequiredField('prompt');
    }
    
    // Decode HTML entities and escapes
    processedPrompt = decodePromptVariables(processedPrompt);
    
    // Replace placeholders with actual values using ${key} format
    processedPrompt = processedPrompt.replace(/\${([\w-]+)}/g, (_match: string, key: string) => {
      const value = inputs[key];
      return value !== undefined ? String(value) : `[Missing value for ${key}]`;
    });

    // If this is not the first prompt, include previous results
    if (promptIndex > 0) {
      const previousResultsQuery = `
        SELECT pr.output_data as result 
        FROM prompt_results pr
        WHERE pr.execution_id = :executionId
        ORDER BY pr.started_at ASC
        LIMIT :limit
      `;
      const previousResultsRaw = await executeSQL(previousResultsQuery, [
        { name: 'executionId', value: { longValue: executionId } },
        { name: 'limit', value: { longValue: promptIndex } }
      ]);
      const previousResults = previousResultsRaw as Array<{ result: string }>;

      previousResults.forEach((result, index) => {
        const resultPlaceholder = `{{result_${index + 1}}}`;
        processedPrompt = processedPrompt.replace(
          new RegExp(resultPlaceholder, 'g'),
          result.result
        );
      });
    }

    // Create prompt result record
    const insertPromptResultQuery = `
      INSERT INTO prompt_results (
        execution_id, prompt_id, input_data, output_data, status, started_at
      ) VALUES (
        :executionId, :promptId, :inputData::jsonb, '', 'running'::execution_status, NOW()
      ) RETURNING id
    `;
    const promptResultInsertRaw = await executeSQL(insertPromptResultQuery, [
      { name: 'executionId', value: { longValue: executionId } },
      { name: 'promptId', value: { longValue: prompt.id } },
      { name: 'inputData', value: { stringValue: JSON.stringify({ prompt: processedPrompt }) } }
    ]);
    const promptResultInsert = promptResultInsertRaw as Array<{ id: number }>;
    const promptResultId = promptResultInsert[0].id;

    // Retrieve knowledge from repositories if configured
    let knowledgeContext = '';
    
    // Parse repository IDs using utility function
    const repositoryIds = parseRepositoryIds(prompt.repositoryIds);
    
    if (repositoryIds && repositoryIds.length > 0) {
      try {
        // Get assistant owner's cognito_sub
        let assistantOwnerSub: string | undefined;
        if (tool.userId) {
          const assistantOwnerQuery = `
            SELECT u.cognito_sub 
            FROM users u 
            WHERE u.id = :userId
          `;
          const ownerResult = await executeSQL<{ cognito_sub: string }>(assistantOwnerQuery, [
            { name: 'userId', value: { longValue: tool.userId } }
          ]);
          assistantOwnerSub = ownerResult[0]?.cognito_sub;
        }

        const knowledgeChunks = await retrieveKnowledgeForPrompt(
          processedPrompt,
          repositoryIds,
          session.sub,
          assistantOwnerSub,
          {
            maxChunks: 10,
            maxTokens: 4000,
            searchType: 'hybrid',
            vectorWeight: 0.8
          }
        );

        if (knowledgeChunks.length > 0) {
          knowledgeContext = formatKnowledgeContext(knowledgeChunks);
          log.info(`Retrieved ${knowledgeChunks.length} knowledge chunks for prompt ${prompt.id}`);
        }
      } catch (knowledgeError) {
        log.error('Error retrieving knowledge:', knowledgeError);
        // Continue without knowledge - don't fail the entire prompt
      }
    }

    // Construct system context with both original context and retrieved knowledge
    let combinedSystemContext = '';
    if (prompt.systemContext && knowledgeContext) {
      combinedSystemContext = `${prompt.systemContext}\n\n${knowledgeContext}`;
    } else if (prompt.systemContext) {
      combinedSystemContext = prompt.systemContext;
    } else if (knowledgeContext) {
      combinedSystemContext = knowledgeContext;
    }

    const messages = [
      ...(combinedSystemContext ? [{ 
        role: 'system' as const, 
        content: combinedSystemContext 
      }] : []),
      { 
        role: 'user' as const, 
        content: processedPrompt 
      }
    ];

    // Log the prompt object to debug field mapping
    log.debug(`[STREAM] Prompt ${promptIndex + 1} model config:`, {
      provider: prompt.provider,
      modelId: prompt.modelId,
      aiModelId: prompt.aiModelId,
      modelName: prompt.modelName,
      allFields: Object.keys(prompt)
    });
    
    // Check if model config is valid
    if (!prompt.provider || !prompt.modelId) {
      log.error(`[STREAM] Invalid model config - Provider: ${prompt.provider}, Model ID: ${prompt.modelId}`);
      throw ErrorFactories.validationFailed([{ field: 'model', message: 'Invalid model configuration' }]);
    }
    
    // Create model using the same factory as chat route
    // modelId from database is the actual model string like "gpt-5"
    const model = await createProviderModel(prompt.provider, prompt.modelId);
    
    // Stream directly using AI SDK's streamText - exactly like /chat does
    const result = streamText({
      model,
      messages: messages.map(m => ({
        role: m.role,
        content: String(m.content)
      })),
      onFinish: async ({ text, usage, finishReason }) => {
        log.info('Stream finished', {
          hasText: !!text,
          textLength: text?.length || 0,
          hasUsage: !!usage,
          finishReason
        });
        
        // Update prompt result with full response
        await executeSQL(
          `UPDATE prompt_results 
           SET output_data = :result, 
               status = 'completed'::execution_status, 
               completed_at = NOW() 
           WHERE id = :id`,
          [
            { name: 'result', value: { stringValue: text } },
            { name: 'id', value: { longValue: promptResultId } }
          ]
        );

        // If this is the last prompt, mark execution as completed
        if (promptIndex === prompts.length - 1) {
          await executeSQL(
            `UPDATE tool_executions 
             SET status = 'completed'::execution_status, 
                 completed_at = NOW()
             WHERE id = :executionId`,
            [
              { name: 'executionId', value: { longValue: executionId } }
            ]
          );
        }
        
        timer({ 
          status: 'success',
          executionId,
          promptIndex,
          tokensUsed: usage?.totalTokens
        });
      }
    });
    
    // Return the exact same type of response as /chat - this is what works on AWS!
    return result.toUIMessageStreamResponse({
      headers: {
        'X-Execution-Id': executionId.toString(),
        'X-Prompt-Index': promptIndex.toString(),
        'X-Request-Id': requestId
      }
    });

  } catch (error) {
    log.error('API error:', error);
    log.error('[STREAM] Full error:', error);
    timer({ status: "error" });
    
    // Mark execution as failed if we have an executionId
    if (req.body) {
      try {
        const body = await req.clone().json();
        if (body.executionId) {
          await executeSQL(
            `UPDATE tool_executions 
             SET status = 'failed'::execution_status, 
                 completed_at = NOW(),
                 error_message = :error
             WHERE id = :executionId`,
            [
              { name: 'executionId', value: { longValue: body.executionId } },
              { name: 'error', value: { 
                stringValue: error instanceof Error ? error.message : 'Unknown error' 
              }}
            ]
          );
        }
      } catch {
        // Ignore errors in error handling
      }
    }
    
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Internal server error',
        stack: error instanceof Error ? error.stack : undefined
      }),
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json', 'X-Request-Id': requestId }
      }
    );
  }
}