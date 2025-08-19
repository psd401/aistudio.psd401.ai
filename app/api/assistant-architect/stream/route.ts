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
  prompt: string; // For useCompletion compatibility
  toolId: number;
  executionId: number;
  inputs: Record<string, unknown>;
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
    const { toolId, executionId, inputs }: StreamRequest = await req.json();

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

    // Mark execution as running
    await executeSQL(
      `UPDATE tool_executions 
       SET status = 'running'::execution_status,
           started_at = COALESCE(started_at, NOW())
       WHERE id = :executionId`,
      [
        { name: 'executionId', value: { longValue: executionId } }
      ]
    );

    // Process all prompts and combine into a single streaming response
    let allMessages = "";
    const promptResults: Array<{ promptId: number; result: string }> = [];

    // If we have just one prompt, stream it directly like /chat does
    if (prompts.length === 1) {
      const prompt = prompts[0];
      
      // Process prompt template with inputs
      let processedPrompt = prompt.content;
      
      if (!processedPrompt) {
        throw ErrorFactories.validationFailed([{ field: 'prompt', message: 'Prompt content is empty' }]);
      }
      
      // Decode HTML entities and escapes
      processedPrompt = decodePromptVariables(processedPrompt);
      
      // Replace placeholders with actual values using ${key} format
      processedPrompt = processedPrompt.replace(/\${([\w-]+)}/g, (_match: string, key: string) => {
        const value = inputs[key];
        return value !== undefined ? String(value) : `[Missing value for ${key}]`;
      });

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

      // Retrieve knowledge if configured
      let knowledgeContext = '';
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
        }
      }

      // Construct system context
      let combinedSystemContext = '';
      if (prompt.systemContext && knowledgeContext) {
        combinedSystemContext = `${prompt.systemContext}\n\n${knowledgeContext}`;
      } else if (prompt.systemContext) {
        combinedSystemContext = prompt.systemContext;
      } else if (knowledgeContext) {
        combinedSystemContext = knowledgeContext;
      }

      // Create model and stream EXACTLY like /chat does
      const model = await createProviderModel(prompt.provider, prompt.modelId);
      
      // Stream response using AI SDK exactly like /chat
      const result = streamText({
        model,
        system: combinedSystemContext,
        messages: [
          { 
            role: 'user' as const, 
            content: processedPrompt 
          }
        ],
        onFinish: async ({ text }) => {
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

          // Mark execution as completed
          await executeSQL(
            `UPDATE tool_executions 
             SET status = 'completed'::execution_status, 
                 completed_at = NOW()
             WHERE id = :executionId`,
            [
              { name: 'executionId', value: { longValue: executionId } }
            ]
          );
          
          timer({ status: 'success' });
        }
      });

      // Return EXACTLY like /chat does with toUIMessageStreamResponse
      return result.toUIMessageStreamResponse({
        headers: {
          'X-Execution-Id': executionId.toString(),
          'X-Request-Id': requestId
        }
      });
      
    } else {
      // Multiple prompts - process sequentially
      // For now, process all and return combined result
      for (let i = 0; i < prompts.length; i++) {
        const prompt = prompts[i];
        
        // Process prompt template with inputs
        let processedPrompt = prompt.content;
        
        if (!processedPrompt) {
          log.error(`[STREAM] Prompt content is empty for prompt ${i + 1}`);
          continue;
        }
        
        // Decode HTML entities and escapes
        processedPrompt = decodePromptVariables(processedPrompt);
        
        // Replace placeholders with actual values using ${key} format
        processedPrompt = processedPrompt.replace(/\${([\w-]+)}/g, (_match: string, key: string) => {
          const value = inputs[key];
          return value !== undefined ? String(value) : `[Missing value for ${key}]`;
        });

        // If this is not the first prompt, include previous results
        if (i > 0) {
          promptResults.forEach((prevResult, index) => {
            const resultPlaceholder = `{{result_${index + 1}}}`;
            processedPrompt = processedPrompt.replace(
              new RegExp(resultPlaceholder, 'g'),
              prevResult.result
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

        // Retrieve knowledge if configured
        let knowledgeContext = '';
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
          }
        }

        // Construct system context
        let combinedSystemContext = '';
        if (prompt.systemContext && knowledgeContext) {
          combinedSystemContext = `${prompt.systemContext}\n\n${knowledgeContext}`;
        } else if (prompt.systemContext) {
          combinedSystemContext = prompt.systemContext;
        } else if (knowledgeContext) {
          combinedSystemContext = knowledgeContext;
        }

        // Create model and stream for this prompt
        const model = await createProviderModel(prompt.provider, prompt.modelId);
        
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

        // Add prompt header if multiple prompts
        if (prompts.length > 1) {
          allMessages += `## ${prompt.name || `Prompt ${i + 1}`}\n\n`;
        }

        // Stream this prompt and collect the result
        const streamResult = streamText({
          model,
          messages: messages.map(m => ({
            role: m.role,
            content: String(m.content)
          }))
        });

        // Collect the full response for this prompt
        let promptResponse = '';
        for await (const chunk of streamResult.textStream) {
          promptResponse += chunk;
        }
        
        allMessages += promptResponse;
        if (i < prompts.length - 1) {
          allMessages += "\n\n---\n\n";
        }

        // Update prompt result with full response
        await executeSQL(
          `UPDATE prompt_results 
           SET output_data = :result, 
               status = 'completed'::execution_status, 
               completed_at = NOW() 
           WHERE id = :id`,
          [
            { name: 'result', value: { stringValue: promptResponse } },
            { name: 'id', value: { longValue: promptResultId } }
          ]
        );

        // Store result for next prompt
        promptResults.push({ promptId: prompt.id, result: promptResponse });
      }

      // Mark execution as completed
      await executeSQL(
        `UPDATE tool_executions 
         SET status = 'completed'::execution_status, 
             completed_at = NOW()
         WHERE id = :executionId`,
        [
          { name: 'executionId', value: { longValue: executionId } }
        ]
      );

      // For multiple prompts, return the combined text as a stream
      // Use streamText with the combined result
      const model = await createProviderModel(prompts[0].provider, prompts[0].modelId);
      const result = streamText({
        model,
        messages: [
          { 
            role: 'assistant' as const, 
            content: allMessages 
          }
        ]
      });

      return result.toUIMessageStreamResponse({
        headers: {
          'X-Execution-Id': executionId.toString(),
          'X-Request-Id': requestId
        }
      });
    }

  } catch (error) {
    log.error('API error:', error);
    timer({ status: "error" });
    
    // Mark execution as failed
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