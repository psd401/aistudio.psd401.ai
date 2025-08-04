import { 
  generateText, 
  streamText, 
  generateObject,
  embed,
  embedMany,
  tool,
  CoreMessage,
  CoreTool,
  StreamTextResult,
  ToolExecutionError,
  InvalidToolArgumentsError,
  NoSuchToolError,
  ToolCallRepairError,
  FinishReason,
  CoreToolCall,
  CoreToolResult
} from 'ai'
import { createAzure } from '@ai-sdk/azure'
import { google } from '@ai-sdk/google'
import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock'
import { createOpenAI } from '@ai-sdk/openai'
// Removed fromNodeProviderChain - not needed when using default credential chain
import { z } from 'zod'
import logger from "@/lib/logger"

interface ModelConfig {
  provider: string
  modelId: string
}

export interface StreamingOptions {
  onToken?: (token: string) => void
  onFinish?: (result: { 
    text?: string; 
    toolCalls?: CoreToolCall<string, unknown>[]; 
    toolResults?: CoreToolResult<string, unknown, unknown>[]; 
    finishReason?: FinishReason; 
    usage?: { 
      promptTokens?: number; 
      completionTokens?: number 
    } 
  }) => void
  onError?: (error: Error) => void
}

export interface ToolDefinition {
  name: string
  description: string
  parameters: z.ZodType<unknown>
  execute: (args: unknown) => Promise<unknown>
}

// Get the appropriate model client based on provider
async function getModelClient(modelConfig: ModelConfig) {
  const { Settings } = await import('@/lib/settings-manager');
  
  switch (modelConfig.provider) {
    case 'amazon-bedrock': {
      logger.info('[ai-helpers] Starting Bedrock initialization for model:', modelConfig.modelId);
      
      try {
        const bedrockConfig = await Settings.getBedrock();
        logger.info('[ai-helpers] Bedrock settings retrieved:', {
          hasAccessKey: !!bedrockConfig.accessKeyId,
          hasSecretKey: !!bedrockConfig.secretAccessKey,
          region: bedrockConfig.region || 'us-east-1',
          environment: process.env.AWS_EXECUTION_ENV || 'local'
        });
        
        const bedrockOptions: Parameters<typeof createAmazonBedrock>[0] = {
          region: bedrockConfig.region || 'us-east-1'
        };
        
        // In AWS Lambda, always use IAM role credentials (ignore stored credentials)
        const isAwsLambda = !!process.env.AWS_LAMBDA_FUNCTION_NAME;
        
        if (bedrockConfig.accessKeyId && bedrockConfig.secretAccessKey && !isAwsLambda) {
          // Only use stored credentials for local development
          logger.info('[ai-helpers] Using explicit credentials from settings (local dev)');
          bedrockOptions.accessKeyId = bedrockConfig.accessKeyId;
          bedrockOptions.secretAccessKey = bedrockConfig.secretAccessKey;
        } else {
          // AWS environment or no stored credentials - let SDK handle credentials automatically
          logger.info('[ai-helpers] Using default AWS credential chain', { isAwsLambda });
          // Don't set any credentials - let the SDK use the default credential provider chain
          // This will use IAM role credentials in Lambda, which work properly
        }
        
        logger.info('[ai-helpers] Creating Bedrock client with options:', {
          region: bedrockOptions.region,
          hasAccessKeyId: !!bedrockOptions.accessKeyId,
          hasSecretAccessKey: !!bedrockOptions.secretAccessKey,
          hasSessionToken: !!bedrockOptions.sessionToken
        });
        
        const bedrock = createAmazonBedrock(bedrockOptions);
        const model = bedrock(modelConfig.modelId);
        
        logger.info('[ai-helpers] Bedrock model created successfully');
        return model;
      } catch (error) {
        logger.error('[ai-helpers] BEDROCK INITIALIZATION FAILED:', {
          modelId: modelConfig.modelId,
          error: error instanceof Error ? {
            name: error.name,
            message: error.message,
            stack: error.stack,
            ...Object.getOwnPropertyNames(error).reduce((acc: Record<string, unknown>, key) => {
              if (!['name', 'message', 'stack'].includes(key)) {
                acc[key] = (error as unknown as Record<string, unknown>)[key];
              }
              return acc;
            }, {} as Record<string, unknown>)
          } : String(error),
          environment: {
            AWS_REGION: process.env.AWS_REGION,
            AWS_EXECUTION_ENV: process.env.AWS_EXECUTION_ENV,
            NODE_ENV: process.env.NODE_ENV
          }
        });
        throw error;
      }
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

      return azureClient(modelConfig.modelId)
    }

    case 'google': {
      const googleApiKey = await Settings.getGoogleAI();
      
      if (!googleApiKey) {
        throw new Error('Google API key is not configured. Please set GOOGLE_API_KEY in the admin panel.');
      }
      
      // Manually set the environment variable that the Google AI SDK is looking for
      process.env.GOOGLE_GENERATIVE_AI_API_KEY = googleApiKey;
      
      return google(modelConfig.modelId);
    }

    case 'openai': {
      const openAIKey = await Settings.getOpenAI();
      
      if (!openAIKey) {
        throw new Error('OpenAI API key is not configured. Please set OPENAI_API_KEY in the admin panel.');
      }
      
      const openai = createOpenAI({
        apiKey: openAIKey
      });
      
      return openai(modelConfig.modelId);
    }

    default:
      throw new Error(`Unsupported provider: ${modelConfig.provider}`)
  }
}

// Generate a text completion
export async function generateCompletion(
  modelConfig: ModelConfig,
  messages: CoreMessage[],
  tools?: Record<string, CoreTool>
) {
  const model = await getModelClient(modelConfig);
  
  try {
    const result = await generateText({
      model,
      messages,
      tools,
      maxSteps: tools ? 5 : undefined // Allow multi-step tool calling
    });

    if (!result.text) {
      throw new Error(`No content returned from ${modelConfig.provider}`);
    }

    return result.text;
  } catch (error) {
    // Handle specific AI SDK errors
    if (error instanceof NoSuchToolError) {
      logger.error('[generateCompletion] Tool not found:', error.toolName);
      throw new Error(`AI tried to use unknown tool: ${error.toolName}`);
    } else if (error instanceof InvalidToolArgumentsError) {
      logger.error('[generateCompletion] Invalid tool arguments:', error);
      throw new Error(`Invalid arguments for tool ${error.toolName}: ${error.message}`);
    } else if (error instanceof ToolExecutionError) {
      logger.error('[generateCompletion] Tool execution failed:', error);
      throw new Error(`Tool ${error.toolName} failed: ${error.message}`);
    }
    
    throw error;
  }
}

// Stream a text completion
export async function streamCompletion(
  modelConfig: ModelConfig,
  messages: CoreMessage[],
  options?: StreamingOptions,
  tools?: Record<string, CoreTool>
): Promise<StreamTextResult<Record<string, CoreTool>, unknown>> {
  const model = await getModelClient(modelConfig);
  
  try {
    const result = await streamText({
      model,
      messages,
      tools,
      maxSteps: tools ? 5 : undefined,
      onChunk: ({ chunk }) => {
        if (chunk.type === 'text-delta' && options?.onToken) {
          options.onToken(chunk.textDelta);
        }
      },
      onFinish: options?.onFinish
    });

    return result;
  } catch (error) {
    logger.error('[streamCompletion] Error during streaming:', error);
    throw error;
  }
}

// Generate a structured object
export async function generateStructuredOutput<T>(
  modelConfig: ModelConfig,
  messages: CoreMessage[],
  schema: z.ZodType<T>
): Promise<T> {
  const model = await getModelClient(modelConfig);
  
  const result = await generateObject({
    model,
    messages,
    schema,
    mode: 'json' // Use JSON mode for better compatibility
  });

  return result.object;
}

// Helper to create a tool from a definition
export function createTool(definition: ToolDefinition): CoreTool {
  return tool({
    description: definition.description,
    parameters: definition.parameters,
    execute: definition.execute
  });
}

// Export error types for consumers
export {
  ToolExecutionError,
  InvalidToolArgumentsError,
  NoSuchToolError,
  ToolCallRepairError
};

// Embedding configuration interface
export interface EmbeddingConfig {
  provider: string
  modelId: string
  dimensions: number
  maxTokens: number
  batchSize: number
}

// Get embedding configuration from settings
export async function getEmbeddingConfig(): Promise<EmbeddingConfig> {
  const { getSettings } = await import('@/lib/settings-manager');
  const settings = await getSettings([
    'EMBEDDING_MODEL_PROVIDER',
    'EMBEDDING_MODEL_ID', 
    'EMBEDDING_DIMENSIONS',
    'EMBEDDING_MAX_TOKENS',
    'EMBEDDING_BATCH_SIZE'
  ])
  
  if (!settings['EMBEDDING_MODEL_PROVIDER'] || !settings['EMBEDDING_MODEL_ID']) {
    throw new Error('Embedding configuration not found in settings')
  }
  
  return {
    provider: settings['EMBEDDING_MODEL_PROVIDER'],
    modelId: settings['EMBEDDING_MODEL_ID'],
    dimensions: parseInt(settings['EMBEDDING_DIMENSIONS'] || '1536', 10),
    maxTokens: parseInt(settings['EMBEDDING_MAX_TOKENS'] || '8192', 10),
    batchSize: parseInt(settings['EMBEDDING_BATCH_SIZE'] || '100', 10)
  }
}

// Get embedding model client
async function getEmbeddingModelClient(config: ModelConfig) {
  const { Settings } = await import('@/lib/settings-manager');
  
  switch (config.provider) {
    case 'openai': {
      const openAIKey = await Settings.getOpenAI();
      
      if (!openAIKey) {
        throw new Error('OpenAI API key not configured');
      }
      
      const openai = createOpenAI({
        apiKey: openAIKey
      });
      
      return openai.embedding(config.modelId);
    }
    
    case 'amazon-bedrock': {
      logger.info('[ai-helpers] Starting Bedrock embedding initialization for model:', config.modelId);
      
      try {
        const bedrockConfig = await Settings.getBedrock();
        logger.info('[ai-helpers] Bedrock embedding settings retrieved:', {
          hasAccessKey: !!bedrockConfig.accessKeyId,
          hasSecretKey: !!bedrockConfig.secretAccessKey,
          region: bedrockConfig.region || 'us-east-1',
          environment: process.env.AWS_EXECUTION_ENV || 'local'
        });
        
        const bedrockOptions: Parameters<typeof createAmazonBedrock>[0] = {
          region: bedrockConfig.region || 'us-east-1'
        };
        
        // In AWS Lambda, always use IAM role credentials (ignore stored credentials)
        const isAwsLambda = !!process.env.AWS_LAMBDA_FUNCTION_NAME;
        
        if (bedrockConfig.accessKeyId && bedrockConfig.secretAccessKey && !isAwsLambda) {
          // Only use stored credentials for local development
          logger.info('[ai-helpers] Using explicit credentials for embeddings (local dev)');
          bedrockOptions.accessKeyId = bedrockConfig.accessKeyId;
          bedrockOptions.secretAccessKey = bedrockConfig.secretAccessKey;
        } else {
          // AWS environment or no stored credentials - let SDK handle credentials automatically
          logger.info('[ai-helpers] Using default AWS credential chain for embeddings', { isAwsLambda });
          // Don't set any credentials - let the SDK use the default credential provider chain
          // This will use IAM role credentials in Lambda, which work properly
        }
        
        logger.info('[ai-helpers] Creating Bedrock embedding client');
        const bedrock = createAmazonBedrock(bedrockOptions);
        const embeddingModel = bedrock.embedding(config.modelId);
        
        logger.info('[ai-helpers] Bedrock embedding model created successfully');
        return embeddingModel;
      } catch (error) {
        logger.error('[ai-helpers] BEDROCK EMBEDDING INITIALIZATION FAILED:', {
          modelId: config.modelId,
          error: error instanceof Error ? {
            name: error.name,
            message: error.message,
            stack: error.stack,
            ...Object.getOwnPropertyNames(error).reduce((acc: Record<string, unknown>, key) => {
              if (!['name', 'message', 'stack'].includes(key)) {
                acc[key] = (error as unknown as Record<string, unknown>)[key];
              }
              return acc;
            }, {} as Record<string, unknown>)
          } : String(error),
          environment: {
            AWS_REGION: process.env.AWS_REGION,
            AWS_EXECUTION_ENV: process.env.AWS_EXECUTION_ENV,
            NODE_ENV: process.env.NODE_ENV
          }
        });
        throw error;
      }
    }
    
    default:
      throw new Error(`Unsupported embedding provider: ${config.provider}`)
  }
}

// Generate embedding for a single text
export async function generateEmbedding(
  text: string,
  config?: Partial<EmbeddingConfig>
): Promise<number[]> {
  const embeddingConfig = config ? { ...await getEmbeddingConfig(), ...config } : await getEmbeddingConfig()
  
  const modelConfig: ModelConfig = {
    provider: embeddingConfig.provider,
    modelId: embeddingConfig.modelId
  }
  
  const model = await getEmbeddingModelClient(modelConfig)
  
  try {
    const result = await embed({
      model,
      value: text
    })
    
    return Array.from(result.embedding)
  } catch (error) {
    logger.error('[generateEmbedding] Error generating embedding:', error)
    throw new Error(`Failed to generate embedding: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

// Generate embeddings for multiple texts (batch processing)
export async function generateEmbeddings(
  texts: string[],
  config?: Partial<EmbeddingConfig>
): Promise<number[][]> {
  const embeddingConfig = config ? { ...await getEmbeddingConfig(), ...config } : await getEmbeddingConfig()
  
  const modelConfig: ModelConfig = {
    provider: embeddingConfig.provider,
    modelId: embeddingConfig.modelId
  }
  
  const model = await getEmbeddingModelClient(modelConfig)
  
  try {
    // Process in batches according to configured batch size
    const embeddings: number[][] = []
    const batchSize = embeddingConfig.batchSize
    
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize)
      
      const result = await embedMany({
        model,
        values: batch
      })
      
      // Convert embeddings to arrays of numbers
      embeddings.push(...result.embeddings.map(embedding => Array.from(embedding)))
    }
    
    return embeddings
  } catch (error) {
    logger.error('[generateEmbeddings] Error generating embeddings:', error)
    throw new Error(`Failed to generate embeddings: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

// Calculate cosine similarity between two embeddings
export function cosineSimilarity(embedding1: number[], embedding2: number[]): number {
  if (embedding1.length !== embedding2.length) {
    throw new Error('Embeddings must have the same length')
  }
  
  let dotProduct = 0
  let norm1 = 0
  let norm2 = 0
  
  for (let i = 0; i < embedding1.length; i++) {
    dotProduct += embedding1[i] * embedding2[i]
    norm1 += embedding1[i] * embedding1[i]
    norm2 += embedding2[i] * embedding2[i]
  }
  
  norm1 = Math.sqrt(norm1)
  norm2 = Math.sqrt(norm2)
  
  if (norm1 === 0 || norm2 === 0) {
    return 0
  }
  
  return dotProduct / (norm1 * norm2)
}

// Find most similar embeddings
export function findMostSimilar(
  queryEmbedding: number[],
  embeddings: Array<{ id: string | number; embedding: number[] }>,
  topK: number = 10
): Array<{ id: string | number; similarity: number }> {
  const similarities = embeddings.map(item => ({
    id: item.id,
    similarity: cosineSimilarity(queryEmbedding, item.embedding)
  }))
  
  // Sort by similarity descending and take top K
  return similarities
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK)
} 