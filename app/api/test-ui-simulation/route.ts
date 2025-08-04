import { NextResponse } from 'next/server'
import { executeSQL } from '@/lib/db/data-api-adapter'
import { generateCompletion } from '@/lib/ai-helpers'
import { CoreMessage } from 'ai'
import logger from '@/lib/logger'
import { transformSnakeToCamel } from '@/lib/db/field-mapper'

// This simulates exactly what happens when a user selects a Bedrock model in the UI
export async function GET() {
  const results = {
    timestamp: new Date().toISOString(),
    environment: {
      AWS_REGION: process.env.AWS_REGION,
      AWS_LAMBDA_FUNCTION_NAME: process.env.AWS_LAMBDA_FUNCTION_NAME,
      AWS_EXECUTION_ENV: process.env.AWS_EXECUTION_ENV
    },
    steps: {} as Record<string, any>
  }
  
  try {
    // Step 1: Get a Bedrock model from the database (simulating UI model selection)
    const modelQuery = `
      SELECT id, name, provider, model_id
      FROM ai_models
      WHERE provider = 'amazon-bedrock' 
        AND active = true 
        AND chat_enabled = true
      ORDER BY name
      LIMIT 1
    `
    const modelResult = await executeSQL<{ id: number; name: string; provider: string; modelId: string }>(modelQuery)
    
    if (modelResult.length === 0) {
      results.steps.databaseQuery = {
        success: false,
        error: 'No active Bedrock models found in database'
      }
      return NextResponse.json(results)
    }
    
    // Transform snake_case to camelCase like /chat does
    const models = modelResult.map(m => transformSnakeToCamel<{ id: number; name: string; provider: string; modelId: string }>(m))
    const aiModel = models[0]
    
    results.steps.databaseQuery = {
      success: true,
      model: aiModel
    }
    
    // Step 2: Call generateCompletion exactly like /chat does
    logger.info('[test-ui-simulation] Testing generateCompletion with model from DB:', aiModel)
    
    const messages: CoreMessage[] = [
      { role: 'system' as const, content: 'You are a helpful AI assistant.' },
      { role: 'user' as const, content: 'Say "test"' }
    ]
    
    try {
      const startTime = Date.now()
      const aiResponseContent = await generateCompletion(
        {
          provider: aiModel.provider,
          modelId: aiModel.modelId  // This is what /chat passes
        },
        messages
      )
      
      results.steps.generateCompletion = {
        success: true,
        response: aiResponseContent,
        executionTime: Date.now() - startTime
      }
    } catch (error) {
      logger.error('[test-ui-simulation] generateCompletion error:', error)
      results.steps.generateCompletion = {
        success: false,
        error: error instanceof Error ? {
          name: error.name,
          message: error.message,
          stack: error.stack,
          // Include AWS-specific error fields
          ...(error as any)
        } : String(error)
      }
    }
    
    // Step 3: Also test a known working provider for comparison
    const openAiQuery = `
      SELECT id, name, provider, model_id
      FROM ai_models
      WHERE provider = 'openai' 
        AND active = true 
        AND chat_enabled = true
      ORDER BY name
      LIMIT 1
    `
    const openAiResult = await executeSQL<{ id: number; name: string; provider: string; modelId: string }>(openAiQuery)
    
    if (openAiResult.length > 0) {
      const openAiModels = openAiResult.map(m => transformSnakeToCamel<{ id: number; name: string; provider: string; modelId: string }>(m))
      const openAiModel = openAiModels[0]
      
      results.steps.openAiComparison = {
        model: openAiModel
      }
      
      try {
        const startTime = Date.now()
        const aiResponseContent = await generateCompletion(
          {
            provider: openAiModel.provider,
            modelId: openAiModel.modelId
          },
          messages
        )
        
        results.steps.openAiComparison.success = true
        results.steps.openAiComparison.response = aiResponseContent
        results.steps.openAiComparison.executionTime = Date.now() - startTime
      } catch (error) {
        logger.error('[test-ui-simulation] OpenAI generateCompletion error:', error)
        results.steps.openAiComparison.success = false
        results.steps.openAiComparison.error = error instanceof Error ? error.message : String(error)
      }
    }
    
  } catch (error) {
    logger.error('[test-ui-simulation] General error:', error)
    results.error = error instanceof Error ? {
      name: error.name,
      message: error.message,
      stack: error.stack
    } : String(error)
  }
  
  return NextResponse.json(results)
}