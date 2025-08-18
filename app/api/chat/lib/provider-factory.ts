import { createOpenAI } from '@ai-sdk/openai';
import { createAzure } from '@ai-sdk/azure';
import { google } from '@ai-sdk/google';
import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { Settings } from '@/lib/settings-manager';
import { ErrorFactories } from '@/lib/error-utils';
import { createLogger } from '@/lib/logger';
import { LanguageModel } from 'ai';

const log = createLogger({ module: 'provider-factory' });

/**
 * Creates a provider-specific model instance
 * Extensible design for easy addition of new providers
 */
export async function createProviderModel(provider: string, modelId: string): Promise<LanguageModel> {
  log.info(`Creating model for provider: ${provider}, modelId: ${modelId}`);
  
  switch (provider) {
    case 'openai':
      return await createOpenAIModel(modelId);
    case 'google':
      return await createGoogleModel(modelId);
    case 'amazon-bedrock':
      return await createBedrockModel(modelId);
    case 'azure':
      return await createAzureModel(modelId);
    default:
      log.error(`Unsupported provider: ${provider}`);
      throw ErrorFactories.validationFailed([
        { field: 'provider', message: `Provider '${provider}' is not supported` }
      ]);
  }
}

/**
 * OpenAI Provider - Supports GPT-5, GPT-4, GPT-3.5, etc.
 */
async function createOpenAIModel(modelId: string): Promise<LanguageModel> {
  try {
    const apiKey = await Settings.getOpenAI();
    if (!apiKey) {
      log.error('OpenAI API key not configured');
      throw ErrorFactories.sysConfigurationError('OpenAI API key not configured');
    }
    
    log.debug(`Creating OpenAI model: ${modelId}`);
    const openai = createOpenAI({ apiKey });
    return openai(modelId);
  } catch (error) {
    log.error('Failed to create OpenAI model', { modelId, error });
    throw error;
  }
}

/**
 * Google AI Provider - Supports Gemini models
 */
async function createGoogleModel(modelId: string): Promise<LanguageModel> {
  try {
    const apiKey = await Settings.getGoogleAI();
    if (!apiKey) {
      log.error('Google API key not configured');
      throw ErrorFactories.sysConfigurationError('Google API key not configured');
    }
    
    log.debug(`Creating Google model: ${modelId}`);
    // Set environment variable for Google SDK
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = apiKey;
    return google(modelId);
  } catch (error) {
    log.error('Failed to create Google model', { modelId, error });
    throw error;
  }
}

/**
 * Amazon Bedrock Provider - Supports Claude, Llama, and other Bedrock models
 */
async function createBedrockModel(modelId: string): Promise<LanguageModel> {
  try {
    const config = await Settings.getBedrock();
    const isLambda = !!process.env.AWS_LAMBDA_FUNCTION_NAME;
    
    log.debug(`Creating Bedrock model: ${modelId}`, {
      hasAccessKey: !!config.accessKeyId,
      hasSecretKey: !!config.secretAccessKey,
      region: config.region || 'us-east-1',
      isLambda
    });
    
    const bedrockOptions: Parameters<typeof createAmazonBedrock>[0] = {
      region: config.region || 'us-east-1'
    };
    
    // Only use explicit credentials for local development
    // In Lambda, use IAM role credentials
    if (!isLambda && config.accessKeyId && config.secretAccessKey) {
      log.debug('Using explicit credentials for local development');
      bedrockOptions.accessKeyId = config.accessKeyId;
      bedrockOptions.secretAccessKey = config.secretAccessKey;
    } else {
      log.debug('Using default AWS credential chain');
      // Let SDK use the default credential provider chain
      // This works with IAM roles in Lambda
    }
    
    const bedrock = createAmazonBedrock(bedrockOptions);
    return bedrock(modelId);
  } catch (error) {
    log.error('Failed to create Bedrock model', { modelId, error });
    throw error;
  }
}

/**
 * Azure OpenAI Provider
 */
async function createAzureModel(modelId: string): Promise<LanguageModel> {
  try {
    const config = await Settings.getAzureOpenAI();
    if (!config.key || !config.resourceName) {
      log.error('Azure OpenAI not configured');
      throw ErrorFactories.sysConfigurationError('Azure OpenAI not configured');
    }
    
    log.debug(`Creating Azure model: ${modelId}`);
    const azure = createAzure({ 
      apiKey: config.key, 
      resourceName: config.resourceName 
    });
    return azure(modelId);
  } catch (error) {
    log.error('Failed to create Azure model', { modelId, error });
    throw error;
  }
}

/**
 * Helper to validate if a provider is supported
 */
export function isSupportedProvider(provider: string): boolean {
  return ['openai', 'google', 'amazon-bedrock', 'azure'].includes(provider);
}

/**
 * Get list of supported providers
 */
export function getSupportedProviders(): string[] {
  return ['openai', 'google', 'amazon-bedrock', 'azure'];
}