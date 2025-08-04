import { NextResponse } from 'next/server'
import { generateCompletion } from '@/lib/ai-helpers'
import { CoreMessage } from 'ai'
import logger from '@/lib/logger'

// Public endpoint that simulates /chat behavior
export async function POST(req: Request) {
  try {
    const { provider = 'amazon-bedrock', modelId = 'us.anthropic.claude-3-5-haiku-20241022-v1:0' } = await req.json()
    
    logger.info('[test-chat-simulation] Starting test with:', { provider, modelId })
    
    // Simulate the exact messages structure from /chat
    const messages: CoreMessage[] = [
      { role: 'system' as const, content: 'You are a helpful AI assistant.' },
      { role: 'user' as const, content: 'Say "test"' }
    ]
    
    // Call generateCompletion exactly like /chat does
    logger.info('[test-chat-simulation] Calling generateCompletion')
    const startTime = Date.now()
    
    try {
      const aiResponseContent = await generateCompletion(
        { provider, modelId },
        messages
      )
      
      const executionTime = Date.now() - startTime
      
      return NextResponse.json({
        success: true,
        response: aiResponseContent,
        executionTime,
        provider,
        modelId,
        environment: {
          AWS_REGION: process.env.AWS_REGION,
          AWS_LAMBDA_FUNCTION_NAME: process.env.AWS_LAMBDA_FUNCTION_NAME,
          AWS_EXECUTION_ENV: process.env.AWS_EXECUTION_ENV
        }
      })
    } catch (error) {
      logger.error('[test-chat-simulation] generateCompletion error:', error)
      
      return NextResponse.json({
        success: false,
        error: error instanceof Error ? {
          name: error.name,
          message: error.message,
          stack: error.stack,
          // Include any AWS-specific error details
          ...(error as any)
        } : String(error),
        provider,
        modelId,
        executionTime: Date.now() - startTime
      })
    }
  } catch (error) {
    logger.error('[test-chat-simulation] General error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }, { status: 500 })
  }
}

// Also provide a GET endpoint for easy testing
export async function GET() {
  logger.info('[test-chat-simulation] GET request received')
  
  // Test both Bedrock and OpenAI to compare
  const results = {
    timestamp: new Date().toISOString(),
    environment: {
      AWS_REGION: process.env.AWS_REGION,
      AWS_LAMBDA_FUNCTION_NAME: process.env.AWS_LAMBDA_FUNCTION_NAME,
      AWS_EXECUTION_ENV: process.env.AWS_EXECUTION_ENV
    },
    tests: {} as Record<string, any>
  }
  
  // Test Bedrock directly without fetch
  try {
    logger.info('[test-chat-simulation] Testing Bedrock directly')
    const messages: CoreMessage[] = [
      { role: 'system' as const, content: 'You are a helpful AI assistant.' },
      { role: 'user' as const, content: 'Say "test"' }
    ]
    
    const startTime = Date.now()
    const aiResponseContent = await generateCompletion(
      { provider: 'amazon-bedrock', modelId: 'us.anthropic.claude-3-5-haiku-20241022-v1:0' },
      messages
    )
    
    results.tests.bedrock = {
      success: true,
      response: aiResponseContent,
      executionTime: Date.now() - startTime,
      provider: 'amazon-bedrock'
    }
  } catch (error) {
    logger.error('[test-chat-simulation] Bedrock error:', error)
    results.tests.bedrock = {
      success: false,
      error: error instanceof Error ? {
        message: error.message,
        name: error.name,
        stack: error.stack,
        // Include any AWS-specific error details
        ...(error as any)
      } : String(error),
      provider: 'amazon-bedrock'
    }
  }
  
  // Test OpenAI for comparison
  try {
    logger.info('[test-chat-simulation] Testing OpenAI directly')
    const messages: CoreMessage[] = [
      { role: 'system' as const, content: 'You are a helpful AI assistant.' },
      { role: 'user' as const, content: 'Say "test"' }
    ]
    
    const startTime = Date.now()
    const aiResponseContent = await generateCompletion(
      { provider: 'openai', modelId: 'gpt-3.5-turbo' },
      messages
    )
    
    results.tests.openai = {
      success: true,
      response: aiResponseContent,
      executionTime: Date.now() - startTime,
      provider: 'openai'
    }
  } catch (error) {
    logger.error('[test-chat-simulation] OpenAI error:', error)
    results.tests.openai = {
      success: false,
      error: error instanceof Error ? {
        message: error.message,
        name: error.name,
        stack: error.stack
      } : String(error),
      provider: 'openai'
    }
  }
  
  return NextResponse.json(results)
}