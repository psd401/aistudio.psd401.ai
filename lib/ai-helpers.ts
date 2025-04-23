import { generateText, CoreMessage } from 'ai'
import { createAzure } from '@ai-sdk/azure'
import { google } from '@ai-sdk/google'
import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock'

interface ModelConfig {
  provider: string
  modelId: string
}

export async function generateCompletion(
  modelConfig: ModelConfig,
  messages: CoreMessage[]
) {
  console.log('[generateCompletion] Received messages:', JSON.stringify(messages, null, 2));

  switch (modelConfig.provider) {
    case 'amazon-bedrock': {
      const region = process.env.BEDROCK_REGION || 'unknown-region';
      const accessKeyId = process.env.BEDROCK_ACCESS_KEY_ID?.substring(0, 4) + '...' || 'not-set';
      console.log(`[generateCompletion] Bedrock: Using region '${region}', access key starting with '${accessKeyId}', model ID '${modelConfig.modelId}'`);
      
      const bedrock = createAmazonBedrock({
        region: process.env.BEDROCK_REGION || '',
        accessKeyId: process.env.BEDROCK_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.BEDROCK_SECRET_ACCESS_KEY || ''
      })

      const result = await generateText({
        model: bedrock(modelConfig.modelId),
        messages
      })

      if (!result.text) {
        throw new Error('No content returned from Amazon Bedrock')
      }

      return result.text
    }

    case 'azure': {
      const azureClient = createAzure({
        apiKey: process.env.AZURE_OPENAI_KEY || '',
        resourceName: process.env.AZURE_OPENAI_RESOURCENAME || ''
      })

      const result = await generateText({
        model: azureClient(modelConfig.modelId),
        messages
      })

      if (!result.text) {
        throw new Error('No content returned from Azure')
      }

      return result.text
    }

    case 'google': {
      process.env.GOOGLE_GENERATIVE_AI_API_KEY = process.env.GOOGLE_API_KEY
      const result = await generateText({
        model: google(modelConfig.modelId),
        messages
      })

      if (!result.text) {
        throw new Error('No content returned from Google')
      }

      return result.text
    }

    default:
      throw new Error(`Unsupported provider: ${modelConfig.provider}`)
  }
} 