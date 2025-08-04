import { NextResponse } from 'next/server'
import { Settings } from '@/lib/settings-manager'
import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock'
import logger from '@/lib/logger'

export async function GET() {
  const results = {
    timestamp: new Date().toISOString(),
    environment: {
      NODE_ENV: process.env.NODE_ENV,
      AWS_REGION: process.env.AWS_REGION,
      AWS_LAMBDA_FUNCTION_NAME: process.env.AWS_LAMBDA_FUNCTION_NAME,
    }
  }
  
  try {
    // Test the exact initialization code from compare-models
    const modelId = 'anthropic.claude-3-haiku-20240307-v1:0'
    
    logger.info('[test-compare] Starting Bedrock initialization for model:', modelId)
    
    const config = await Settings.getBedrock()
    logger.info('[test-compare] Bedrock settings retrieved:', {
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
      logger.info('[test-compare] Using explicit credentials from settings (local dev)')
      bedrockConfig.accessKeyId = config.accessKeyId
      bedrockConfig.secretAccessKey = config.secretAccessKey
    } else {
      // AWS environment or no stored credentials - let SDK handle credentials automatically
      logger.info('[test-compare] Using default AWS credential chain', { isAwsLambda })
    }
    
    logger.info('[test-compare] Creating Bedrock client with options:', {
      region: bedrockConfig.region,
      hasAccessKeyId: !!bedrockConfig.accessKeyId,
      hasSecretAccessKey: !!bedrockConfig.secretAccessKey,
      hasSessionToken: !!bedrockConfig.sessionToken
    })
    
    const bedrock = createAmazonBedrock(bedrockConfig)
    const model = bedrock(modelId)
    
    logger.info('[test-compare] Bedrock model created successfully')
    
    // Try to use it
    const { streamText } = await import('ai')
    const result = await streamText({
      model,
      messages: [{ role: 'user' as const, content: 'Say "test"' }],
    })
    
    let response = ''
    for await (const chunk of result.textStream) {
      response += chunk
    }
    
    return NextResponse.json({
      ...results,
      success: true,
      response,
      config: {
        hasAccessKey: !!config.accessKeyId,
        hasSecretKey: !!config.secretAccessKey,
        region: config.region,
        isAwsLambda,
        usingStoredCredentials: !!(config.accessKeyId && config.secretAccessKey && !isAwsLambda)
      }
    })
  } catch (error) {
    logger.error('[test-compare] Error:', error)
    return NextResponse.json({
      ...results,
      success: false,
      error: error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : String(error)
    })
  }
}