import { NextResponse } from 'next/server'
import { generateCompletion } from '@/lib/ai-helpers'
import { CoreMessage } from 'ai'
import logger from '@/lib/logger'

// Public endpoint that simulates /chat behavior
export async function POST(req: Request) {
  try {
    const { provider = 'amazon-bedrock', modelId = 'anthropic.claude-3-haiku-20240307-v1:0' } = await req.json()
    
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
    tests: {} as Record<string, any>
  }
  
  // Test Bedrock
  try {
    const bedrockResponse = await fetch(new URL('/api/test-chat-simulation', process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: 'amazon-bedrock',
        modelId: 'anthropic.claude-3-haiku-20240307-v1:0'
      })
    })
    results.tests.bedrock = await bedrockResponse.json()
  } catch (error) {
    results.tests.bedrock = {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }
  }
  
  // Test OpenAI for comparison
  try {
    const openaiResponse = await fetch(new URL('/api/test-chat-simulation', process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: 'openai',
        modelId: 'gpt-3.5-turbo'
      })
    })
    results.tests.openai = await openaiResponse.json()
  } catch (error) {
    results.tests.openai = {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }
  }
  
  return NextResponse.json(results)
}