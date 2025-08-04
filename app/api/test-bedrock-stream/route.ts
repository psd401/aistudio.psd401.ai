import { NextResponse } from 'next/server'
import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock'
import { Settings } from '@/lib/settings-manager'
import { streamText, generateText } from 'ai'
import logger from '@/lib/logger'

export async function GET() {
  const results = {
    timestamp: new Date().toISOString(),
    environment: {
      NODE_ENV: process.env.NODE_ENV,
      AWS_REGION: process.env.AWS_REGION,
      AWS_LAMBDA_FUNCTION_NAME: process.env.AWS_LAMBDA_FUNCTION_NAME,
    },
    tests: {} as Record<string, unknown>
  }
  
  try {
    // Get Bedrock config
    const bedrockConfig = await Settings.getBedrock()
    const bedrockOptions: Parameters<typeof createAmazonBedrock>[0] = {
      region: bedrockConfig.region || 'us-east-1'
    }
    
    // In Lambda, use default credentials
    const isAwsLambda = !!process.env.AWS_LAMBDA_FUNCTION_NAME
    if (bedrockConfig.accessKeyId && bedrockConfig.secretAccessKey && !isAwsLambda) {
      bedrockOptions.accessKeyId = bedrockConfig.accessKeyId
      bedrockOptions.secretAccessKey = bedrockConfig.secretAccessKey
    }
    
    const bedrock = createAmazonBedrock(bedrockOptions)
    const model = bedrock('anthropic.claude-3-haiku-20240307-v1:0')
    
    // Test 1: generateText (working in test-bedrock)
    try {
      logger.info('[test-stream] Testing generateText')
      const result = await generateText({
        model,
        messages: [{ role: 'user', content: 'Say "test"' }],
        maxTokens: 10
      })
      results.tests.generateText = {
        success: true,
        response: result.text
      }
    } catch (error) {
      logger.error('[test-stream] generateText error:', error)
      results.tests.generateText = {
        success: false,
        error: error instanceof Error ? {
          name: error.name,
          message: error.message,
          stack: error.stack
        } : String(error)
      }
    }
    
    // Test 2: streamText (failing in compare-models)
    try {
      logger.info('[test-stream] Testing streamText')
      const result = await streamText({
        model,
        messages: [{ role: 'user', content: 'Say "test"' }],
        maxTokens: 10
      })
      
      let response = ''
      for await (const chunk of result.textStream) {
        response += chunk
      }
      
      results.tests.streamText = {
        success: true,
        response
      }
    } catch (error) {
      logger.error('[test-stream] streamText error:', error)
      results.tests.streamText = {
        success: false,
        error: error instanceof Error ? {
          name: error.name,
          message: error.message,
          stack: error.stack,
          // Include any AWS-specific error details
          url: (error as Record<string, unknown>).url,
          statusCode: (error as Record<string, unknown>).statusCode,
          responseHeaders: (error as Record<string, unknown>).responseHeaders,
          responseBody: (error as Record<string, unknown>).responseBody
        } : String(error)
      }
    }
    
    // Test 3: streamText without await (like compare-models)
    try {
      logger.info('[test-stream] Testing streamText without await')
      const result = streamText({
        model,
        messages: [{ role: 'user', content: 'Say "test"' }],
        maxTokens: 10
      })
      
      let response = ''
      for await (const chunk of result.textStream) {
        response += chunk
      }
      
      results.tests.streamTextNoAwait = {
        success: true,
        response
      }
    } catch (error) {
      logger.error('[test-stream] streamText no await error:', error)
      results.tests.streamTextNoAwait = {
        success: false,
        error: error instanceof Error ? {
          name: error.name,
          message: error.message,
          stack: error.stack
        } : String(error)
      }
    }
    
  } catch (error) {
    results.error = error instanceof Error ? {
      name: error.name,
      message: error.message,
      stack: error.stack
    } : String(error)
  }
  
  return NextResponse.json(results)
}