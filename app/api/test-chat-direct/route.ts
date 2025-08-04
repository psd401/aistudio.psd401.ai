import { NextResponse } from 'next/server'
import logger from '@/lib/logger'

// Test the actual /chat endpoint
export async function GET() {
  const results = {
    timestamp: new Date().toISOString(),
    environment: {
      AWS_REGION: process.env.AWS_REGION,
      AWS_LAMBDA_FUNCTION_NAME: process.env.AWS_LAMBDA_FUNCTION_NAME,
      AWS_EXECUTION_ENV: process.env.AWS_EXECUTION_ENV,
      NODE_ENV: process.env.NODE_ENV
    },
    tests: {} as Record<string, any>
  }
  
  // Create a fake session cookie for auth
  // In production, this would be a real session
  const fakeSessionToken = 'test-session-' + Date.now()
  
  try {
    // Test Bedrock through /chat
    logger.info('[test-chat-direct] Testing Bedrock via /chat endpoint')
    const bedrockResponse = await fetch(new URL('/api/chat', process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').toString(), {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        // Add a fake auth header that the endpoint will reject
        // This helps us see if it's failing at auth or later
        'Cookie': `authjs.session-token=${fakeSessionToken}`
      },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Say "test"' }],
        modelId: 'anthropic.claude-3-haiku-20240307-v1:0',
        source: 'test'
      })
    })
    
    const bedrockText = await bedrockResponse.text()
    let bedrockData
    try {
      bedrockData = JSON.parse(bedrockText)
    } catch {
      bedrockData = { rawResponse: bedrockText }
    }
    
    results.tests.bedrock = {
      status: bedrockResponse.status,
      statusText: bedrockResponse.statusText,
      headers: Object.fromEntries(bedrockResponse.headers.entries()),
      data: bedrockData
    }
  } catch (error) {
    logger.error('[test-chat-direct] Bedrock test error:', error)
    results.tests.bedrock = {
      error: error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : String(error)
    }
  }
  
  try {
    // Test OpenAI through /chat for comparison
    logger.info('[test-chat-direct] Testing OpenAI via /chat endpoint')
    const openaiResponse = await fetch(new URL('/api/chat', process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').toString(), {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Cookie': `authjs.session-token=${fakeSessionToken}`
      },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Say "test"' }],
        modelId: 'gpt-3.5-turbo',
        source: 'test'
      })
    })
    
    const openaiText = await openaiResponse.text()
    let openaiData
    try {
      openaiData = JSON.parse(openaiText)
    } catch {
      openaiData = { rawResponse: openaiText }
    }
    
    results.tests.openai = {
      status: openaiResponse.status,
      statusText: openaiResponse.statusText,
      headers: Object.fromEntries(openaiResponse.headers.entries()),
      data: openaiData
    }
  } catch (error) {
    logger.error('[test-chat-direct] OpenAI test error:', error)
    results.tests.openai = {
      error: error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : String(error)
    }
  }
  
  return NextResponse.json(results)
}