import { NextResponse } from 'next/server'
import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock'
import { fromNodeProviderChain } from '@aws-sdk/credential-providers'
import { Settings } from '@/lib/settings-manager'

export async function GET() {
  const results = {
    timestamp: new Date().toISOString(),
    environment: {
      NODE_ENV: process.env.NODE_ENV,
      AWS_REGION: process.env.AWS_REGION,
      AWS_DEFAULT_REGION: process.env.AWS_DEFAULT_REGION,
      AWS_EXECUTION_ENV: process.env.AWS_EXECUTION_ENV,
      AWS_LAMBDA_FUNCTION_NAME: process.env.AWS_LAMBDA_FUNCTION_NAME,
      // Check for credential env vars (without exposing values)
      hasAwsAccessKeyId: !!process.env.AWS_ACCESS_KEY_ID,
      hasAwsSecretAccessKey: !!process.env.AWS_SECRET_ACCESS_KEY,
      hasAwsSessionToken: !!process.env.AWS_SESSION_TOKEN,
    },
    tests: {} as Record<string, unknown>
  }

  // Test 1: Check settings
  try {
    const bedrockConfig = await Settings.getBedrock()
    results.tests.settingsCheck = {
      success: true,
      hasAccessKeyId: !!bedrockConfig.accessKeyId,
      hasSecretAccessKey: !!bedrockConfig.secretAccessKey,
      region: bedrockConfig.region || 'not set'
    }
  } catch (error) {
    results.tests.settingsCheck = {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }
  }

  // Test 2: Test credential provider
  try {
    const credentialsProvider = fromNodeProviderChain()
    const credentials = await credentialsProvider()
    results.tests.credentialProvider = {
      success: true,
      hasAccessKeyId: !!credentials.accessKeyId,
      hasSecretAccessKey: !!credentials.secretAccessKey,
      hasSessionToken: !!credentials.sessionToken,
      expiration: credentials.expiration?.toISOString() || 'no expiration'
    }
  } catch (error) {
    results.tests.credentialProvider = {
      success: false,
      error: error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : String(error)
    }
  }

  // Test 3: Test AI SDK Bedrock initialization with settings
  try {
    const bedrockConfig = await Settings.getBedrock()
    const bedrockOptions: Parameters<typeof createAmazonBedrock>[0] = {
      region: bedrockConfig.region || 'us-east-1'
    }
    
    if (bedrockConfig.accessKeyId && bedrockConfig.secretAccessKey) {
      bedrockOptions.accessKeyId = bedrockConfig.accessKeyId
      bedrockOptions.secretAccessKey = bedrockConfig.secretAccessKey
    }
    
    const bedrock = createAmazonBedrock(bedrockOptions)
    // Create model instance to test initialization
    bedrock('anthropic.claude-3-haiku-20240307-v1:0')
    
    results.tests.aiSdkWithSettings = {
      success: true,
      message: 'Created Bedrock client with settings credentials'
    }
  } catch (error) {
    results.tests.aiSdkWithSettings = {
      success: false,
      error: error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : String(error)
    }
  }

  // Test 4: Test AI SDK Bedrock initialization with credential provider
  try {
    const credentialsProvider = fromNodeProviderChain()
    const credentials = await credentialsProvider()
    
    const bedrockOptions: Parameters<typeof createAmazonBedrock>[0] = {
      region: process.env.AWS_REGION || 'us-east-1',
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken
    }
    
    const bedrock = createAmazonBedrock(bedrockOptions)
    // Create model instance to test initialization
    bedrock('anthropic.claude-3-haiku-20240307-v1:0')
    
    results.tests.aiSdkWithCredentialProvider = {
      success: true,
      message: 'Created Bedrock client with credential provider'
    }
  } catch (error) {
    results.tests.aiSdkWithCredentialProvider = {
      success: false,
      error: error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : String(error)
    }
  }

  // Test 5: Test SDK without explicit credentials
  try {
    const bedrockConfig = await Settings.getBedrock()
    
    // Only pass region, let SDK handle credentials
    const bedrockOptions: Parameters<typeof createAmazonBedrock>[0] = {
      region: bedrockConfig.region || 'us-east-1'
    }
    
    const bedrock = createAmazonBedrock(bedrockOptions)
    const model = bedrock('anthropic.claude-3-haiku-20240307-v1:0')
    
    // Try to actually use the model
    const { generateText } = await import('ai')
    const result = await generateText({
      model,
      messages: [{ role: 'user', content: 'Say "test"' }],
      maxTokens: 10
    })
    
    results.tests.sdkDefaultCredentials = {
      success: true,
      message: 'SDK with default credentials works',
      response: result.text
    }
  } catch (error) {
    results.tests.sdkDefaultCredentials = {
      success: false,
      error: error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : String(error)
    }
  }

  // Test 6: Test our actual implementation
  let bedrockConfig: Awaited<ReturnType<typeof Settings.getBedrock>> | undefined
  try {
    bedrockConfig = await Settings.getBedrock()
    
    const bedrockOptions: Parameters<typeof createAmazonBedrock>[0] = {
      region: bedrockConfig.region || 'us-east-1'
    }
    
    // In AWS Lambda, always use IAM role credentials (ignore stored credentials)
    const isAwsLambda = !!process.env.AWS_LAMBDA_FUNCTION_NAME
    
    if (bedrockConfig.accessKeyId && bedrockConfig.secretAccessKey && !isAwsLambda) {
      bedrockOptions.accessKeyId = bedrockConfig.accessKeyId
      bedrockOptions.secretAccessKey = bedrockConfig.secretAccessKey
      // Will be set after the test completes
    } else {
      // Will be set after the test completes
    }
    
    const bedrock = createAmazonBedrock(bedrockOptions)
    const model = bedrock('anthropic.claude-3-haiku-20240307-v1:0')
    
    // Try to actually use the model
    const { generateText } = await import('ai')
    const result = await generateText({
      model,
      messages: [{ role: 'user', content: 'Say "test"' }],
      maxTokens: 10
    })
    
    results.tests.actualImplementation = {
      success: true,
      message: 'Our implementation works',
      response: result.text,
      usingStoredCredentials: !!(bedrockConfig?.accessKeyId && bedrockConfig?.secretAccessKey && !isAwsLambda),
      isAwsLambda
    }
  } catch (error) {
    const isAwsLambda = !!process.env.AWS_LAMBDA_FUNCTION_NAME
    results.tests.actualImplementation = {
      success: false,
      usingStoredCredentials: !!(bedrockConfig?.accessKeyId && bedrockConfig?.secretAccessKey && !isAwsLambda),
      isAwsLambda,
      error: error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack,
        // Include any additional error properties
        ...Object.getOwnPropertyNames(error).reduce((acc: Record<string, unknown>, key) => {
          if (!['name', 'message', 'stack'].includes(key)) {
            acc[key] = (error as unknown as Record<string, unknown>)[key]
          }
          return acc
        }, {} as Record<string, unknown>)
      } : String(error)
    }
  }

  return NextResponse.json(results, { 
    status: 200,
    headers: {
      'Content-Type': 'application/json',
    }
  })
}