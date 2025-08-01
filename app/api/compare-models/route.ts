import { NextRequest } from 'next/server'
import { streamText } from 'ai'
import { createAzure } from '@ai-sdk/azure'
import { google } from '@ai-sdk/google'
import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock'
import { createOpenAI } from '@ai-sdk/openai'
import { getServerSession } from "@/lib/auth/server-session"
import { hasToolAccess } from "@/utils/roles"
import { executeSQL } from "@/lib/db/data-api-adapter"
import { Settings } from "@/lib/settings-manager"
import logger from "@/lib/logger"
import { ensureRDSString } from "@/lib/type-helpers"

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

    // Get models from database
    const models = await executeSQL(
      `SELECT id, model_id, provider, name FROM ai_models 
       WHERE model_id IN (:model1Id, :model2Id) AND active = true AND chat_enabled = true`,
      [
        { name: 'model1Id', value: { stringValue: model1Id } },
        { name: 'model2Id', value: { stringValue: model2Id } }
      ]
    )

    if (models.length !== 2) {
      return new Response('Invalid model selection', { status: 400 })
    }

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

    // Create a ReadableStream that merges both model streams
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder()
        
        // Helper to send SSE data
        const sendData = (data: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
        }
        
        // Start both streams in parallel
        const promises = [
          (async () => {
            try {
              const result = await streamText({
                model: modelInstance1,
                messages,
              })
              
              for await (const chunk of result.textStream) {
                sendData({ model1: chunk })
              }
              sendData({ model1Finished: true })
            } catch (error) {
              logger.error('Model 1 streaming error:', error)
              sendData({ model1Error: error instanceof Error ? error.message : 'Unknown error' })
            }
          })(),

          (async () => {
            try {
              const result = await streamText({
                model: modelInstance2,
                messages,
              })
              
              for await (const chunk of result.textStream) {
                sendData({ model2: chunk })
              }
              sendData({ model2Finished: true })
            } catch (error) {
              logger.error('Model 2 streaming error:', error)
              sendData({ model2Error: error instanceof Error ? error.message : 'Unknown error' })
            }
          })()
        ]
        
        // Wait for both streams to complete
        await Promise.all(promises)
        
        // Send done signal and close the stream
        sendData({ done: true })
        controller.close()
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
  provider: string
  modelId: string
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
      const config = await Settings.getBedrock()
      if (!config.accessKeyId) throw new Error('Bedrock not configured')
      const bedrock = createAmazonBedrock({
        region: config.region || undefined,
        accessKeyId: config.accessKeyId || undefined,
        secretAccessKey: config.secretAccessKey || undefined
      })
      return bedrock(modelId)
    }
    default:
      throw new Error(`Unknown provider: ${provider}`)
  }
}