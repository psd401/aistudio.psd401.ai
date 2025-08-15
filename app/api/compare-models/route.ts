import { NextRequest } from 'next/server'
import { streamText } from 'ai'
import { getServerSession } from "@/lib/auth/server-session"
import { hasToolAccess } from "@/utils/roles"
import { executeSQL } from "@/lib/db/data-api-adapter"
import { createLogger, generateRequestId, startTimer } from "@/lib/logger"
import { createProviderModel } from "../chat/lib/provider-factory"
import { getModelConfig } from "../chat/lib/conversation-handler"

export async function POST(req: NextRequest) {
  const requestId = generateRequestId();
  const timer = startTimer("api.compare-models");
  const log = createLogger({ requestId, route: "api.compare-models" });
  
  log.info("POST /api/compare-models - Starting model comparison");
  
  try {
    // Check authentication
    const session = await getServerSession()
    if (!session) {
      log.warn("Unauthorized access attempt to model comparison");
      timer({ status: "error", reason: "unauthorized" });
      return new Response('Unauthorized', { 
        status: 401,
        headers: { "X-Request-Id": requestId }
      })
    }
    
    log.debug("User authenticated", { userId: session.sub });

    // Check tool access
    const hasAccess = await hasToolAccess("model-compare")
    if (!hasAccess) {
      log.warn("Access denied to model comparison tool", { userId: session.sub });
      timer({ status: "error", reason: "access_denied" });
      return new Response('Access denied', { 
        status: 403,
        headers: { "X-Request-Id": requestId }
      })
    }

    const { prompt, model1Id, model2Id } = await req.json()
    
    log.debug("Model comparison request", { model1Id, model2Id, promptLength: prompt?.length });
    
    // Validate inputs
    if (!prompt || !model1Id || !model2Id) {
      log.warn("Missing required fields in model comparison request");
      timer({ status: "error", reason: "validation_error" });
      return new Response('Missing required fields', { 
        status: 400,
        headers: { "X-Request-Id": requestId }
      })
    }

    // Get user ID for database persistence
    const userResult = await executeSQL(
      "SELECT id FROM users WHERE cognito_sub = :userId",
      [{ name: 'userId', value: { stringValue: session.sub } }]
    )

    if (userResult.length === 0) {
      log.error("User not found in database", { userId: session.sub });
      timer({ status: "error", reason: "user_not_found" });
      return new Response('User not found', { 
        status: 404,
        headers: { "X-Request-Id": requestId }
      })
    }

    const userId = Number(userResult[0].id)

    // Get model configurations using the same logic as chat
    const model1Config = await getModelConfig(model1Id)
    const model2Config = await getModelConfig(model2Id)

    if (!model1Config || !model2Config) {
      log.warn("Invalid model selection", { model1Id, model2Id });
      timer({ status: "error", reason: "invalid_models" });
      return new Response('Invalid model selection', { 
        status: 400,
        headers: { "X-Request-Id": requestId }
      })
    }

    // Initialize model instances using the provider factory
    const modelInstance1 = await createProviderModel(model1Config.provider, model1Config.model_id)
    const modelInstance2 = await createProviderModel(model2Config.provider, model2Config.model_id)
    
    log.info("Models initialized successfully", { 
      model1: model1Config.name, 
      model2: model2Config.name 
    });

    const messages = [
      { role: 'system' as const, content: 'You are a helpful AI assistant.' },
      { role: 'user' as const, content: prompt }
    ]

    // Variables to track responses and execution times
    let response1 = ''
    let response2 = ''
    let executionTime1: number | null = null
    let executionTime2: number | null = null
    let aborted = false

    // Create a ReadableStream that merges both model streams
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder()
        
        // Helper to send SSE data
        const sendData = (data: Record<string, unknown>) => {
          if (!aborted) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
          }
        }

        // Handle abort signal
        const cleanup = () => {
          aborted = true
          log.info('Model comparison request aborted by client')
        }
        req.signal.addEventListener('abort', cleanup)
        
        // Start both streams in parallel
        const promises = [
          (async () => {
            const startTime = Date.now()
            try {
              const result = streamText({
                model: modelInstance1,
                messages,
                abortSignal: req.signal,
              })
              
              for await (const chunk of result.textStream) {
                if (aborted) break
                response1 += chunk
                sendData({ model1: chunk })
              }
              executionTime1 = Date.now() - startTime
              sendData({ model1Finished: true })
            } catch (error) {
              if (!aborted) {
                log.error('Model 1 streaming error:', error)
                sendData({ model1Error: error instanceof Error ? error.message : 'Unknown error' })
              }
            }
          })(),

          (async () => {
            const startTime = Date.now()
            try {
              const result = streamText({
                model: modelInstance2,
                messages,
                abortSignal: req.signal,
              })
              
              for await (const chunk of result.textStream) {
                if (aborted) break
                response2 += chunk
                sendData({ model2: chunk })
              }
              executionTime2 = Date.now() - startTime
              sendData({ model2Finished: true })
            } catch (error) {
              if (!aborted) {
                log.error('Model 2 streaming error:', error)
                sendData({ model2Error: error instanceof Error ? error.message : 'Unknown error' })
              }
            }
          })()
        ]
        
        // Wait for both streams to complete
        await Promise.all(promises)

        // Save comparison to database if not aborted and at least one response was generated
        if (!aborted && (response1 || response2)) {
          try {
            await executeSQL(
              `INSERT INTO model_comparisons 
               (user_id, prompt, model1_id, model2_id, response1, response2, 
                model1_name, model2_name, execution_time_ms1, execution_time_ms2)
               VALUES (:userId, :prompt, :model1Id, :model2Id, :response1, :response2,
                :model1Name, :model2Name, :executionTime1, :executionTime2)`,
              [
                { name: 'userId', value: { longValue: userId } },
                { name: 'prompt', value: { stringValue: prompt } },
                { name: 'model1Id', value: { longValue: model1Config.id } },
                { name: 'model2Id', value: { longValue: model2Config.id } },
                { name: 'response1', value: response1 ? { stringValue: response1 } : { isNull: true } },
                { name: 'response2', value: response2 ? { stringValue: response2 } : { isNull: true } },
                { name: 'model1Name', value: { stringValue: model1Config.name } },
                { name: 'model2Name', value: { stringValue: model2Config.name } },
                { name: 'executionTime1', value: executionTime1 ? { longValue: executionTime1 } : { isNull: true } },
                { name: 'executionTime2', value: executionTime2 ? { longValue: executionTime2 } : { isNull: true } }
              ]
            )
            log.info(`Saved model comparison for user ${userId}`, { 
              executionTime1, 
              executionTime2 
            });
            timer({ status: "success" });
          } catch (error) {
            log.error('Failed to save model comparison:', error)
            // Don't fail the stream if save fails
          }
        }
        
        // Send done signal and close the stream
        if (!aborted) {
          sendData({ done: true })
        }
        controller.close()

        // Remove event listener
        req.signal.removeEventListener('abort', cleanup)
      }
    })

    // Return the SSE stream response
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Request-Id': requestId
      },
    })
  } catch (error) {
    timer({ status: "error" });
    log.error('Compare models error:', error)
    return new Response(
      error instanceof Error ? error.message : 'Internal server error', 
      { 
        status: 500,
        headers: { "X-Request-Id": requestId }
      }
    )
  }
}