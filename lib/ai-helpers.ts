import { generateText, CoreMessage } from 'ai'
import { createAzure } from '@ai-sdk/azure'
import { google } from '@ai-sdk/google'
import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock'
import logger from "@/lib/logger"
import { Settings } from "@/lib/settings-manager"

interface ModelConfig {
  provider: string
  modelId: string
}

export async function generateCompletion(
  modelConfig: ModelConfig,
  messages: CoreMessage[]
) {
  // Log the full prompt for debugging
  logger.info('[generateCompletion] SENDING TO LLM:', messages.map(m => `\n[${m.role}]\n${m.content}`).join('\n---\n'));

  logger.info('[generateCompletion] Received messages:', JSON.stringify(messages, null, 2));

  switch (modelConfig.provider) {
    case 'amazon-bedrock': {
      const bedrockConfig = await Settings.getBedrock();
      const region = bedrockConfig.region || 'unknown-region';
      logger.info(`[generateCompletion] Using Amazon Bedrock with region '${region}' and model ID '${modelConfig.modelId}'`);
      
      if (!bedrockConfig.accessKeyId || !bedrockConfig.secretAccessKey || !bedrockConfig.region) {
        throw new Error('Amazon Bedrock is not configured. Please set the required settings in the admin panel.')
      }
      
      const bedrock = createAmazonBedrock({
        region: bedrockConfig.region,
        accessKeyId: bedrockConfig.accessKeyId,
        secretAccessKey: bedrockConfig.secretAccessKey
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
      const azureConfig = await Settings.getAzureOpenAI();
      
      if (!azureConfig.key || !azureConfig.resourceName) {
        throw new Error('Azure OpenAI is not configured. Please set the required settings in the admin panel.')
      }
      
      const azureClient = createAzure({
        apiKey: azureConfig.key,
        resourceName: azureConfig.resourceName
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
      // Get API key from settings
      const googleApiKey = await Settings.getGoogleAI();
      
      logger.info(`[generateCompletion] Using Google AI with model ID '${modelConfig.modelId}'`);
      
      if (!googleApiKey) {
        logger.error('[generateCompletion] Google API key is missing');
        throw new Error('Google API key is not configured. Please set GOOGLE_API_KEY in the admin panel.');
      }
      
      // Manually set the environment variable that the Google AI SDK is looking for
      // This ensures the SDK finds the key regardless of which env var name we use
      process.env.GOOGLE_GENERATIVE_AI_API_KEY = googleApiKey;
      
      try {
        const googleClient = google(modelConfig.modelId);
      
        const result = await generateText({
          model: googleClient,
          messages
        });

        if (!result.text) {
          throw new Error('No content returned from Google');
        }

        return result.text;
      } catch (error) {
        logger.error('[generateCompletion] Google AI error:', error);
        
        // Check if it's an API key error
        if (error instanceof Error && error.message && error.message.includes('API key')) {
          throw new Error(`Google API key issue: ${error.message}. Please check your Google API key in the admin panel.`);
        }
        
        // Rethrow any other errors
        throw error;
      }
    }

    default:
      throw new Error(`Unsupported provider: ${modelConfig.provider}`)
  }
} 