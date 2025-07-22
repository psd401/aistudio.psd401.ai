import { getServerSession } from "@/lib/auth/server-session";
import { executeSQL } from "@/lib/db/data-api-adapter";
import { streamCompletion } from "@/lib/ai-helpers";
import logger from "@/lib/logger";

interface StreamRequest {
  toolId: number;
  executionId: number;
  inputs: Record<string, unknown>;
}

export async function POST(req: Request) {
  const session = await getServerSession();
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const { toolId, executionId, inputs }: StreamRequest = await req.json();
    logger.info(`[STREAM] Request received - Tool: ${toolId}, Execution: ${executionId}`);

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
      return new Response(`Tool not found or inactive: ${toolId}`, { status: 404 });
    }

    const tool = toolResult[0];

    // Get prompts for this tool
    const promptsQuery = `
      SELECT cp.id, cp.name, cp.content as prompt, cp.position as chain_order, cp.model_id as ai_model_id,
             cp.system_context,
             am.model_id, am.provider, am.name as model_name
      FROM chain_prompts cp
      JOIN ai_models am ON cp.model_id = am.id
      WHERE cp.assistant_architect_id = :toolId
      ORDER BY cp.position ASC
    `;
    const prompts = await executeSQL(promptsQuery, [
      { name: 'toolId', value: { longValue: toolId } }
    ]);

    if (!prompts.length) {
      return new Response('No prompts configured for this tool', { status: 400 });
    }

    // Get tool executions record
    const executionQuery = `
      SELECT id FROM tool_executions 
      WHERE id = :executionId
    `;
    const executionResult = await executeSQL(executionQuery, [
      { name: 'executionId', value: { longValue: executionId } }
    ]);

    if (!executionResult.length) {
      return new Response('Execution not found', { status: 404 });
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
            
            // Send prompt start event
            controller.enqueue(encoder.encode(
              `data: ${JSON.stringify({
                type: 'prompt_start',
                promptIndex: i,
                promptId: prompt.id,
                modelName: prompt.model_name
              })}\n\n`
            ));

            try {
              logger.info(`[STREAM] Processing prompt ${i + 1}/${prompts.length} - ID: ${prompt.id}`);
              
              // Process prompt template with inputs
              let processedPrompt = prompt.prompt;
              
              // Replace placeholders with actual values
              Object.entries(inputs).forEach(([key, value]) => {
                const placeholder = `{{${key}}}`;
                processedPrompt = processedPrompt.replace(
                  new RegExp(placeholder, 'g'),
                  String(value)
                );
              });

              // If this is not the first prompt, include previous results
              if (i > 0) {
                const previousResultsQuery = `
                  SELECT pr.output_data as result 
                  FROM prompt_results pr
                  WHERE pr.execution_id = :executionId
                  ORDER BY pr.started_at ASC
                `;
                const previousResults = await executeSQL(previousResultsQuery, [
                  { name: 'executionId', value: { longValue: executionId } }
                ]);

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
              const promptResultInsert = await executeSQL(insertPromptResultQuery, [
                { name: 'executionId', value: { longValue: executionId } },
                { name: 'promptId', value: { longValue: prompt.id } },
                { name: 'inputData', value: { stringValue: JSON.stringify({ prompt: processedPrompt }) } }
              ]);
              const promptResultId = promptResultInsert[0].id;

              // Stream the AI response
              let fullResponse = '';
              let tokenCount = 0;
              const messages = [
                ...(prompt.system_context ? [{ 
                  role: 'system' as const, 
                  content: prompt.system_context 
                }] : []),
                { 
                  role: 'user' as const, 
                  content: processedPrompt 
                }
              ];

              logger.info(`[STREAM] Using model: ${prompt.provider}/${prompt.model_id}`);
              logger.info(`[STREAM] Prompt content length: ${processedPrompt.length} chars`);
              logger.info(`[STREAM] Processed prompt preview:`, processedPrompt.substring(0, 200) + '...');
              logger.info(`[STREAM] System context:`, prompt.system_context || 'None');
              logger.info(`[STREAM] Messages being sent:`, JSON.stringify(messages, null, 2));
              
              try {
                const streamResult = await streamCompletion(
                  {
                    provider: prompt.provider,
                    modelId: prompt.model_id
                  },
                  messages,
                  {
                  onToken: (token) => {
                    fullResponse += token;
                    tokenCount++;
                    
                    if (tokenCount === 1) {
                      logger.info(`[STREAM] First token received for prompt ${i + 1}`);
                    }
                    
                    // Send token to client
                    controller.enqueue(encoder.encode(
                      `data: ${JSON.stringify({
                        type: 'token',
                        promptIndex: i,
                        token: token
                      })}\n\n`
                    ));
                  },
                  onFinish: async () => {
                    logger.info(`[STREAM] onFinish called for prompt ${i + 1}. Total response length: ${fullResponse.length}`);
                    // Update prompt result with full response
                    await executeSQL(
                      `UPDATE prompt_results 
                       SET output_data = :result, status = 'completed'::execution_status, completed_at = NOW() 
                       WHERE id = :id`,
                      [
                        { name: 'result', value: { stringValue: fullResponse } },
                        { name: 'id', value: { longValue: promptResultId } }
                      ]
                    );
                  }
                  }
                );

                // Let the stream complete naturally through onFinish
              // The textPromise will resolve when streaming is done
              const finalText = await streamResult.textPromise;
              
              // Only override if we got a valid response
              if (finalText !== undefined && finalText !== null) {
                fullResponse = finalText;
              }
              
              // If no response was generated, log error
              if (!fullResponse) {
                logger.error(`[STREAM] No response generated for prompt ${i + 1}. Model: ${prompt.provider}/${prompt.model_id}`);
                throw new Error('No response generated from AI model');
              }
              
              logger.info(`[STREAM] Prompt ${i + 1} completed. Tokens: ${tokenCount}, Length: ${fullResponse?.length || 0}`);

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