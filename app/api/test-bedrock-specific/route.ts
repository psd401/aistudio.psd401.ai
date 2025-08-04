import { NextResponse } from 'next/server'
import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock'
import { createOpenAI } from '@ai-sdk/openai'
import { Settings } from '@/lib/settings-manager'
import { streamText } from 'ai'
import logger from '@/lib/logger'

export async function POST(req: Request) {
  try {
    const { prompt = "Say 'test'" } = await req.json()
    
    // Get settings
    const [bedrockConfig, openaiKey] = await Promise.all([
      Settings.getBedrock(),
      Settings.getOpenAI()
    ])
    
    // Test 1: OpenAI streaming (known to work)
    let openaiResult = null
    try {
      if (openaiKey) {
        const openai = createOpenAI({ apiKey: openaiKey })
        const model = openai('gpt-3.5-turbo')
        
        logger.info('[test-bedrock-specific] Testing OpenAI streaming')
        const result = streamText({
          model,
          messages: [{ role: 'user', content: prompt }],
          maxTokens: 10
        })
        
        let response = ''
        for await (const chunk of result.textStream) {
          response += chunk
        }
        
        openaiResult = {
          success: true,
          response,
          provider: 'openai'
        }
      }
    } catch (error) {
      logger.error('[test-bedrock-specific] OpenAI error:', error)
      openaiResult = {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        provider: 'openai'
      }
    }
    
    // Test 2: Bedrock streaming (with and without await)
    let bedrockWithAwait = null
    let bedrockWithoutAwait = null
    
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
    const bedrockModel = bedrock('anthropic.claude-3-haiku-20240307-v1:0')
    
    // Test with await
    try {
      logger.info('[test-bedrock-specific] Testing Bedrock with await')
      const result = await streamText({
        model: bedrockModel,
        messages: [{ role: 'user', content: prompt }],
        maxTokens: 10
      })
      
      let response = ''
      for await (const chunk of result.textStream) {
        response += chunk
      }
      
      bedrockWithAwait = {
        success: true,
        response,
        provider: 'bedrock-with-await'
      }
    } catch (error) {
      logger.error('[test-bedrock-specific] Bedrock with await error:', error)
      bedrockWithAwait = {
        success: false,
        error: error instanceof Error ? {
          message: error.message,
          name: error.name,
          stack: error.stack,
          // AWS specific fields
          ...((error as any).url && { url: (error as any).url }),
          ...((error as any).statusCode && { statusCode: (error as any).statusCode }),
          ...((error as any).responseBody && { responseBody: (error as any).responseBody })
        } : String(error),
        provider: 'bedrock-with-await'
      }
    }
    
    // Test without await (like compare-models)
    try {
      logger.info('[test-bedrock-specific] Testing Bedrock without await')
      const result = streamText({
        model: bedrockModel,
        messages: [{ role: 'user', content: prompt }],
        maxTokens: 10
      })
      
      let response = ''
      for await (const chunk of result.textStream) {
        response += chunk
      }
      
      bedrockWithoutAwait = {
        success: true,
        response,
        provider: 'bedrock-without-await'
      }
    } catch (error) {
      logger.error('[test-bedrock-specific] Bedrock without await error:', error)
      bedrockWithoutAwait = {
        success: false,
        error: error instanceof Error ? {
          message: error.message,
          name: error.name,
          stack: error.stack
        } : String(error),
        provider: 'bedrock-without-await'
      }
    }
    
    return NextResponse.json({
      timestamp: new Date().toISOString(),
      environment: {
        AWS_REGION: process.env.AWS_REGION,
        AWS_LAMBDA_FUNCTION_NAME: process.env.AWS_LAMBDA_FUNCTION_NAME,
        isAwsLambda
      },
      results: {
        openai: openaiResult,
        bedrockWithAwait,
        bedrockWithoutAwait
      }
    })
  } catch (error) {
    logger.error('[test-bedrock-specific] General error:', error)
    return NextResponse.json({
      error: error instanceof Error ? error.message : String(error)
    }, { status: 500 })
  }
}