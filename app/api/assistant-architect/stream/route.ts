import { getServerSession } from "@/lib/auth/server-session";
import { executeSQL } from "@/lib/db/data-api-adapter";
import { streamCompletion } from "@/lib/ai-helpers";
import logger from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";
import { transformSnakeToCamel } from '@/lib/db/field-mapper';
import { NextRequest } from 'next/server';

interface StreamRequest {
  toolId: number;
  executionId: number;
  inputs: Record<string, unknown>;
}

// Add a function to decode HTML entities and remove escapes for variable placeholders
function decodePromptVariables(content: string): string {
  // Replace HTML entity for $ with $
  let decoded = content.replace(/&#x24;|&\#36;/g, '$');
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
  // Apply rate limiting
  const rateLimitResponse = await limiter(req);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const session = await getServerSession();
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const { toolId, executionId, inputs }: StreamRequest = await req.json();

    // Get tool configuration and prompts
    const toolQuery = `
      SELECT aa.id, aa.name, aa.description, aa.status
      FROM assistant_architects aa
      WHERE aa.id = :toolId AND aa.status = 'approved'
    `;
    const toolResult = await executeSQL(toolQuery, [
      { name: 'toolId', value: { longValue: toolId } }
    ]);

    if (!toolResult.length) {
      return new Response('Tool not found or inactive', { status: 404 });
    }

    const tool = transformSnakeToCamel<{ id: number; name: string; description: string; status: string }>(toolResult[0]);

    // Get prompts for this tool
    const promptsQuery = `
      SELECT cp.id, cp.name, cp.content, cp.position, cp.model_id as ai_model_id,
             cp.system_context,
             am.model_id, am.provider, am.name as model_name
      FROM chain_prompts cp
      JOIN ai_models am ON cp.model_id = am.id
      WHERE cp.assistant_architect_id = :toolId
      ORDER BY cp.position ASC
    `;
    const promptsRaw = await executeSQL(promptsQuery, [
      { name: 'toolId', value: { longValue: toolId } }
    ]);
    const prompts = transformSnakeToCamel<Array<{
      id: number;
      name: string;
      content: string;
      position: number;
      aiModelId: number;
      systemContext: string | null;
      modelId: string;
      provider: string;
      modelName: string;
    }>>(promptsRaw);


    if (!prompts.length) {
      return new Response('No prompts configured for this tool', { status: 400 });
    }

    // Get tool executions record and check if it's already being processed
    const executionQuery = `
      SELECT id, status FROM tool_executions 
      WHERE id = :executionId
    `;
    const executionResultRaw = await executeSQL(executionQuery, [
      { name: 'executionId', value: { longValue: executionId } }
    ]);
    const executionResult = transformSnakeToCamel<Array<{ id: number; status: string }>>(executionResultRaw);

    if (!executionResult.length) {
      return new Response('Execution not found', { status: 404 });
    }

    // Check if execution is already completed or failed
    if (executionResult[0].status === 'completed' || executionResult[0].status === 'failed') {
      return new Response('Execution has already been processed', { status: 409 });
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
        logger.error('Failed to mark execution as running:', error);
        // If we can't update the status, it might have been updated by another process
        // Continue anyway
      }
    } else if (executionResult[0].status !== 'running') {
      // If it's not pending or running, something is wrong
      logger.error(`Unexpected execution status: ${executionResult[0].status} for execution ${executionId}`);
      return new Response('Execution is in an invalid state', { status: 400 });
    }

    // Create a ReadableStream for the response
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Send initial metadata
          controller.enqueue(encoder.encode(
            `data: ${JSON.stringify({
              type: 'metadata',
              totalPrompts: prompts.length,
              toolName: tool.name
            })}\n\n`
          ));

          // Execute prompts sequentially
          for (let i = 0; i < prompts.length; i++) {
            const prompt = prompts[i];
            let promptResultId: number | undefined;
            
            // Send prompt start event
            controller.enqueue(encoder.encode(
              `data: ${JSON.stringify({
                type: 'prompt_start',
                promptIndex: i,
                promptId: prompt.id,
                modelName: prompt.modelName
              })}\n\n`
            ));

            try {
              
              // Process prompt template with inputs
              let processedPrompt = prompt.content;
              
              if (!processedPrompt) {
                logger.error(`[STREAM] Prompt content is empty for prompt ${i + 1}`);
                throw new Error('Prompt content is empty');
              }
              
              // Decode HTML entities and escapes
              processedPrompt = decodePromptVariables(processedPrompt);
              
              // Replace placeholders with actual values using ${key} format like the working code
              processedPrompt = processedPrompt.replace(/\${([\w-]+)}/g, (_match: string, key: string) => {
                const value = inputs[key];
                return value !== undefined ? String(value) : `[Missing value for ${key}]`;
              });

              // If this is not the first prompt, include previous results
              if (i > 0) {
                const previousResultsQuery = `
                  SELECT pr.output_data as result 
                  FROM prompt_results pr
                  WHERE pr.execution_id = :executionId
                  ORDER BY pr.started_at ASC
                `;
                const previousResultsRaw = await executeSQL(previousResultsQuery, [
                  { name: 'executionId', value: { longValue: executionId } }
                ]);
                const previousResults = transformSnakeToCamel<Array<{ result: string }>>(previousResultsRaw);

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
                  :executionId, :promptId, :inputData::jsonb, '', 'pending'::execution_status, NOW()
                ) RETURNING id
              `;
              const promptResultInsertRaw = await executeSQL(insertPromptResultQuery, [
                { name: 'executionId', value: { longValue: executionId } },
                { name: 'promptId', value: { longValue: prompt.id } },
                { name: 'inputData', value: { stringValue: JSON.stringify({ prompt: processedPrompt }) } }
              ]);
              const promptResultInsert = transformSnakeToCamel<Array<{ id: number }>>(promptResultInsertRaw);
              promptResultId = promptResultInsert[0].id;

              // Stream the AI response
              let fullResponse = '';
              const messages = [
                ...(prompt.systemContext ? [{ 
                  role: 'system' as const, 
                  content: prompt.systemContext 
                }] : []),
                { 
                  role: 'user' as const, 
                  content: processedPrompt 
                }
              ];

              
              // Check if model config is valid
              if (!prompt.provider || !prompt.modelId) {
                logger.error(`[STREAM] Invalid model config - Provider: ${prompt.provider}, Model ID: ${prompt.modelId}`);
                throw new Error('Invalid model configuration');
              }
              
              try {
                // Send AI initialization event
                controller.enqueue(encoder.encode(
                  `data: ${JSON.stringify({
                    type: 'status',
                    message: 'Initializing AI model...',
                    promptIndex: i
                  })}\n\n`
                ));
                
                const streamResult = await streamCompletion(
                  {
                    provider: prompt.provider,
                    modelId: prompt.modelId
                  },
                  messages
                );
                
                // Send first token event to indicate streaming has started
                controller.enqueue(encoder.encode(
                  `data: ${JSON.stringify({
                    type: 'status',
                    message: 'AI is responding...',
                    promptIndex: i
                  })}\n\n`
                ));
                
                // Actually consume the stream
                for await (const chunk of streamResult.textStream) {
                  fullResponse += chunk;
                  
                  
                  // Send token to client
                  controller.enqueue(encoder.encode(
                    `data: ${JSON.stringify({
                      type: 'token',
                      promptIndex: i,
                      token: chunk
                    })}\n\n`
                  ));
                }
                

                // Update prompt result with full response
                await executeSQL(
                  `UPDATE prompt_results 
                   SET output_data = :result, status = 'completed'::execution_status, completed_at = NOW() 
                   WHERE id = :id`,
                  [
                    { name: 'result', value: { stringValue: fullResponse } },
                    { name: 'id', value: { longValue: promptResultId! } }
                  ]
                );
              
              // If no response was generated, log error
              if (!fullResponse) {
                logger.error(`[STREAM] No response generated for prompt ${i + 1}`);
                throw new Error('No response generated from AI model');
              }

              // Send prompt complete event
              controller.enqueue(encoder.encode(
                `data: ${JSON.stringify({
                  type: 'prompt_complete',
                  promptIndex: i,
                  result: fullResponse
                })}\n\n`
              ));
              
              } catch (streamError) {
                logger.error(`[STREAM] Error during streaming:`, streamError);
                throw streamError;
              }

            } catch (promptError) {
              logger.error('Error executing prompt:', promptError);
              
              // Update prompt result status to failed if we have an ID
              if (typeof promptResultId !== 'undefined') {
                try {
                  await executeSQL(
                    `UPDATE prompt_results 
                     SET status = 'failed'::execution_status, 
                         completed_at = NOW(),
                         error_message = :error
                     WHERE id = :id`,
                    [
                      { name: 'id', value: { longValue: promptResultId } },
                      { name: 'error', value: { stringValue: promptError instanceof Error ? promptError.message : 'Unknown error' } }
                    ]
                  );
                } catch (updateError) {
                  logger.error('Failed to update prompt result status:', updateError);
                }
              }
              
              // Send error event
              controller.enqueue(encoder.encode(
                `data: ${JSON.stringify({
                  type: 'prompt_error',
                  promptIndex: i,
                  error: promptError instanceof Error ? promptError.message : 'Unknown error'
                })}\n\n`
              ));
              
              // Continue with next prompt
            }
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

          // Send completion event
          controller.enqueue(encoder.encode(
            `data: ${JSON.stringify({
              type: 'complete',
              executionId: executionId
            })}\n\n`
          ));

          // Close the stream
          controller.close();

        } catch (error) {
          logger.error('Stream error:', error);
          
          // Mark execution as failed
          await executeSQL(
            `UPDATE tool_executions 
             SET status = 'failed'::execution_status, 
                 completed_at = NOW(),
                 error_message = :error
             WHERE id = :executionId`,
            [
              { name: 'executionId', value: { longValue: executionId } },
              { name: 'error', value: { 
                stringValue: error instanceof Error ? error.message : 'Unknown error' 
              }}
            ]
          );

          // Send error event
          controller.enqueue(encoder.encode(
            `data: ${JSON.stringify({
              type: 'error',
              error: error instanceof Error ? error.message : 'Unknown error'
            })}\n\n`
          ));
          
          controller.close();
        }
      }
    });

    // Return the stream as a Server-Sent Events response
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Execution-Id': executionId.toString()
      }
    });

  } catch (error) {
    logger.error('API error:', error);
    return new Response(
      error instanceof Error ? error.message : 'Internal server error',
      { status: 500 }
    );
  }
}