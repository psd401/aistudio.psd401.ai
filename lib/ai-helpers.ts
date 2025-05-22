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
  // Log the full prompt for debugging
  console.log('[generateCompletion] SENDING TO LLM:', messages.map(m => `\n[${m.role}]\n${m.content}`).join('\n---\n'));

  console.log('[generateCompletion] Received messages:', JSON.stringify(messages, null, 2));

  switch (modelConfig.provider) {
    case 'amazon-bedrock': {
      const region = process.env.BEDROCK_REGION || 'unknown-region';
      console.log(`[generateCompletion] Using Amazon Bedrock with region '${region}' and model ID '${modelConfig.modelId}'`);
      
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
      // Get API key from environment variables
      const googleApiKey = process.env.GOOGLE_API_KEY || '';
      
      console.log(`[generateCompletion] Using Google AI with model ID '${modelConfig.modelId}'`);
      console.log(`[generateCompletion] GOOGLE_API_KEY set: ${!!process.env.GOOGLE_API_KEY}`);
      console.log(`[generateCompletion] GOOGLE_GENERATIVE_AI_API_KEY set: ${!!process.env.GOOGLE_GENERATIVE_AI_API_KEY}`);
      
      if (!googleApiKey) {
        console.error('[generateCompletion] Google API key is missing from environment variables');
        throw new Error('Google API key is not configured. Please set GOOGLE_API_KEY in environment variables.');
      }
      
      // Manually set the environment variable that the Google AI SDK is looking for
      // This ensures the SDK finds the key regardless of which env var name we use
      process.env.GOOGLE_GENERATIVE_AI_API_KEY = googleApiKey;
      
      try {
        const googleClient = google(modelConfig.modelId, {
          apiKey: googleApiKey
        });
      
        const result = await generateText({
          model: googleClient,
          messages
        });

        if (!result.text) {
          throw new Error('No content returned from Google');
        }

        return result.text;
      } catch (error) {
        console.error('[generateCompletion] Google AI error:', error);
        
        // Check if it's an API key error
        if (error.message && error.message.includes('API key')) {
          throw new Error(`Google API key issue: ${error.message}. Please check your GOOGLE_API_KEY environment variable.`);
        }
        
        // Rethrow any other errors
        throw error;
      }
    }

    default:
      throw new Error(`Unsupported provider: ${modelConfig.provider}`)
  }
} 