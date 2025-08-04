import { NextRequest } from 'next/server'
import { streamText } from 'ai'
import { createAzure } from '@ai-sdk/azure'
import { google } from '@ai-sdk/google'
import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock'
import { createOpenAI } from '@ai-sdk/openai'
// Removed fromNodeProviderChain - not needed when using default credential chain
import { getServerSession } from "@/lib/auth/server-session"
import { hasToolAccess } from "@/utils/roles"
import { executeSQL } from "@/lib/db/data-api-adapter"
import { Settings } from "@/lib/settings-manager"
import logger from "@/lib/logger"
import { ensureRDSString } from "@/lib/type-helpers"
import { transformSnakeToCamel } from "@/lib/db/field-mapper"

export async function POST(req: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession()
    if (!session) {
      return new Response('Unauthorized', { status: 401 })
    }

    // Check tool access
    const hasAccess = await hasToolAccess("model-compare")
    if (!hasAccess) {
      return new Response('Access denied', { status: 403 })
    }

    const { prompt, model1Id, model2Id } = await req.json()
    
    // Validate inputs
    if (!prompt || !model1Id || !model2Id) {
      return new Response('Missing required fields', { status: 400 })
    }

    // Get user ID for database persistence
    const userResult = await executeSQL(
      "SELECT id FROM users WHERE cognito_sub = :userId",
      [{ name: 'userId', value: { stringValue: session.sub } }]
    )

    if (userResult.length === 0) {
      return new Response('User not found', { status: 404 })
    }

    const userId = Number(userResult[0].id)

    // Get models from database
    const modelsRaw = await executeSQL(
      `SELECT id, model_id, provider, name FROM ai_models 
       WHERE model_id IN (:model1Id, :model2Id) AND active = true AND chat_enabled = true`,
      [
        { name: 'model1Id', value: { stringValue: model1Id } },
        { name: 'model2Id', value: { stringValue: model2Id } }
      ]
    )

    if (modelsRaw.length !== 2) {
      return new Response('Invalid model selection', { status: 400 })
    }

    // Transform snake_case fields to camelCase
    const models = modelsRaw.map(m => transformSnakeToCamel<ModelData>(m))

    const model1 = models.find(m => m.modelId === model1Id)
    const model2 = models.find(m => m.modelId === model2Id)

    if (!model1 || !model2) {
      return new Response('Models not found', { status: 404 })
    }

    // Initialize model instances
    const modelInstance1 = await initializeModel(model1 as ModelData)
    const modelInstance2 = await initializeModel(model2 as ModelData)

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
          logger.info('Model comparison request aborted by client')
        }
        req.signal.addEventListener('abort', cleanup)
        
        // Start both streams in parallel
        const promises = [
          (async () => {
            const startTime = Date.now()
            try {
              const result = await streamText({
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
                logger.error('Model 1 streaming error:', error)
                sendData({ model1Error: error instanceof Error ? error.message : 'Unknown error' })
              }
            }
          })(),

          (async () => {
            const startTime = Date.now()
            try {
              const result = await streamText({
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
                logger.error('Model 2 streaming error:', error)
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
                { name: 'model1Id', value: { longValue: model1.id } },
                { name: 'model2Id', value: { longValue: model2.id } },
                { name: 'response1', value: response1 ? { stringValue: response1 } : { isNull: true } },
                { name: 'response2', value: response2 ? { stringValue: response2 } : { isNull: true } },
                { name: 'model1Name', value: { stringValue: model1.name } },
                { name: 'model2Name', value: { stringValue: model2.name } },
                { name: 'executionTime1', value: executionTime1 ? { longValue: executionTime1 } : { isNull: true } },
                { name: 'executionTime2', value: executionTime2 ? { longValue: executionTime2 } : { isNull: true } }
              ]
            )
            logger.info(`Saved model comparison for user ${userId}`)
          } catch (error) {
            logger.error('Failed to save model comparison:', error)
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
      },
    })
  } catch (error) {
    logger.error('Compare models error:', error)
    return new Response(
      error instanceof Error ? error.message : 'Internal server error', 
      { status: 500 }
    )
  }
}

interface ModelData {
  id: number
  provider: string
  modelId: string
  name: string
  [key: string]: unknown
}

async function initializeModel(model: ModelData) {
  const provider = ensureRDSString(model.provider)
  const modelId = ensureRDSString(model.modelId)

  switch (provider) {
    case 'openai': {
      const key = await Settings.getOpenAI()
      if (!key) throw new Error('OpenAI key not configured')
      const openai = createOpenAI({ apiKey: key })
      return openai(modelId)
    }
    case 'azure': {
      const config = await Settings.getAzureOpenAI()
      if (!config.key || !config.resourceName) throw new Error('Azure not configured')
      const azure = createAzure({ apiKey: config.key, resourceName: config.resourceName })
      return azure(modelId)
    }
    case 'google': {
      const key = await Settings.getGoogleAI()
      if (!key) throw new Error('Google key not configured')
      process.env.GOOGLE_GENERATIVE_AI_API_KEY = key
      return google(modelId)
    }
    case 'amazon-bedrock': {
      logger.info('[compare-models] Starting Bedrock initialization for model:', modelId)
      
      try {
        const config = await Settings.getBedrock()
        logger.info('[compare-models] Bedrock settings retrieved:', {
          hasAccessKey: !!config.accessKeyId,
          hasSecretKey: !!config.secretAccessKey,
          region: config.region || 'us-east-1',
          environment: process.env.AWS_EXECUTION_ENV || 'local',
          lambdaFunction: process.env.AWS_LAMBDA_FUNCTION_NAME
        })
        
        const bedrockConfig: Parameters<typeof createAmazonBedrock>[0] = {
          region: config.region || 'us-east-1'
        }
        
        // In AWS Lambda, always use IAM role credentials (ignore stored credentials)
        const isAwsLambda = !!process.env.AWS_LAMBDA_FUNCTION_NAME
        
        if (config.accessKeyId && config.secretAccessKey && !isAwsLambda) {
          // Only use stored credentials for local development
          logger.info('[compare-models] Using explicit credentials from settings (local dev)')
          bedrockConfig.accessKeyId = config.accessKeyId
          bedrockConfig.secretAccessKey = config.secretAccessKey
        } else {
          // AWS environment or no stored credentials - let SDK handle credentials automatically
          logger.info('[compare-models] Using default AWS credential chain', { isAwsLambda })
          // Don't set any credentials - let the SDK use the default credential provider chain
          // This will use IAM role credentials in Lambda, which work properly
        }
        
        logger.info('[compare-models] Creating Bedrock client with options:', {
          region: bedrockConfig.region,
          hasAccessKeyId: !!bedrockConfig.accessKeyId,
          hasSecretAccessKey: !!bedrockConfig.secretAccessKey,
          hasSessionToken: !!bedrockConfig.sessionToken
        })
        
        const bedrock = createAmazonBedrock(bedrockConfig)
        const model = bedrock(modelId)
        
        logger.info('[compare-models] Bedrock model created successfully')
        return model
      } catch (error) {
        logger.error('[compare-models] BEDROCK INITIALIZATION FAILED:', {
          modelId: modelId,
          provider: provider,
          error: error instanceof Error ? {
            name: error.name,
            message: error.message,
            stack: error.stack,
            ...Object.getOwnPropertyNames(error).reduce((acc: Record<string, unknown>, key) => {
              if (!['name', 'message', 'stack'].includes(key)) {
                acc[key] = (error as unknown as Record<string, unknown>)[key]
              }
              return acc
            }, {} as Record<string, unknown>)
          } : String(error),
          environment: {
            AWS_REGION: process.env.AWS_REGION,
            AWS_EXECUTION_ENV: process.env.AWS_EXECUTION_ENV,
            AWS_LAMBDA_FUNCTION_NAME: process.env.AWS_LAMBDA_FUNCTION_NAME,
            NODE_ENV: process.env.NODE_ENV
          }
        })
        throw error
      }
    }
    default:
      throw new Error(`Unknown provider: ${provider}`)
  }
}