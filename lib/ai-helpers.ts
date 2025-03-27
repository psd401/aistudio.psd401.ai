import { streamText, generateText } from 'ai'
import { openai } from '@ai-sdk/openai'
import { createAzure } from '@ai-sdk/azure'
import { google } from '@ai-sdk/google'
import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock'

interface ModelConfig {
  provider: string
  modelId: string
}

export async function generateCompletion(
  modelConfig: ModelConfig,
  systemPrompt: string | null | undefined,
  userMessage: string
) {
  // Only include system message if it's provided and non-empty
  const messages = [
    ...(systemPrompt?.trim() ? [{ role: 'system', content: systemPrompt }] : []),
    { role: 'user', content: userMessage }
  ]

  switch (modelConfig.provider) {
    case 'amazon-bedrock': {
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