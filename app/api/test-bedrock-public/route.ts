import { NextResponse } from 'next/server'
import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock'
import { Settings } from '@/lib/settings-manager'
import { streamText, generateText } from 'ai'
import logger from '@/lib/logger'

// Public endpoint for testing - no auth required
export async function GET() {
  const results = {
    timestamp: new Date().toISOString(),
    environment: {
      AWS_REGION: process.env.AWS_REGION,
      AWS_LAMBDA_FUNCTION_NAME: process.env.AWS_LAMBDA_FUNCTION_NAME,
      AWS_EXECUTION_ENV: process.env.AWS_EXECUTION_ENV
    },
    tests: {} as Record<string, unknown>
  }
  
  try {
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
    
    logger.info('[test-bedrock-public] Creating Bedrock client', {
      region: bedrockOptions.region,
      hasCredentials: !!(bedrockOptions.accessKeyId && bedrockOptions.secretAccessKey),
      isAwsLambda
    })
    
    const bedrock = createAmazonBedrock(bedrockOptions)
    const model = bedrock('us.anthropic.claude-3-5-haiku-20241022-v1:0')
    
    // Test 1: generateText (we know this works)
    try {
      logger.info('[test-bedrock-public] Testing generateText')
      const result = await generateText({
        model,
        messages: [{ role: 'user', content: 'Say "test"' }],
        maxTokens: 10
      })
      results.tests.generateText = {
        success: true,
        response: result.text
      }
      logger.info('[test-bedrock-public] generateText succeeded')
    } catch (error) {
      logger.error('[test-bedrock-public] generateText error:', error)
      results.tests.generateText = {
        success: false,
        error: error instanceof Error ? {
          name: error.name,
          message: error.message,
          stack: error.stack
        } : String(error)
      }
    }
    
    // Test 2: streamText with await
    try {
      logger.info('[test-bedrock-public] Testing streamText with await')
      const result = await streamText({
        model,
        messages: [{ role: 'user', content: 'Say "test"' }],
        maxTokens: 10
      })
      
      logger.info('[test-bedrock-public] streamText created, starting to read stream')
      let response = ''
      for await (const chunk of result.textStream) {
        response += chunk
        logger.info('[test-bedrock-public] Received chunk:', chunk)
      }
      
      results.tests.streamTextWithAwait = {
        success: true,
        response
      }
      logger.info('[test-bedrock-public] streamText with await succeeded')
    } catch (error) {
      logger.error('[test-bedrock-public] streamText with await error:', error)
      results.tests.streamTextWithAwait = {
        success: false,
        error: error instanceof Error ? {
          name: error.name,
          message: error.message,
          stack: error.stack,
          // Include AWS-specific error fields
          url: (error as any).url,
          statusCode: (error as any).statusCode,
          responseBody: (error as any).responseBody
        } : String(error)
      }
    }
    
    // Test 3: streamText without await (like compare-models)
    try {
      logger.info('[test-bedrock-public] Testing streamText without await')
      const result = streamText({
        model,
        messages: [{ role: 'user', content: 'Say "test"' }],
        maxTokens: 10
      })
      
      logger.info('[test-bedrock-public] streamText created without await, starting to read stream')
      let response = ''
      for await (const chunk of result.textStream) {
        response += chunk
        logger.info('[test-bedrock-public] Received chunk without await:', chunk)
      }
      
      results.tests.streamTextNoAwait = {
        success: true,
        response
      }
      logger.info('[test-bedrock-public] streamText without await succeeded')
    } catch (error) {
      logger.error('[test-bedrock-public] streamText without await error:', error)
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
    logger.error('[test-bedrock-public] General error:', error)
    results.error = error instanceof Error ? {
      name: error.name,
      message: error.message,
      stack: error.stack
    } : String(error)
  }
  
  return NextResponse.json(results)
}