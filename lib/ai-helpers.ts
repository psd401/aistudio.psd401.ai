import { 
  generateText, 
  streamText, 
  generateObject,
  tool,
  CoreMessage,
  CoreTool,
  StreamTextResult,
  GenerateObjectResult,
  ToolExecutionError,
  InvalidToolArgumentsError,
  NoSuchToolError,
  ToolCallRepairError
} from 'ai'
import { createAzure } from '@ai-sdk/azure'
import { google } from '@ai-sdk/google'
import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock'
import { createOpenAI } from '@ai-sdk/openai'
import { z } from 'zod'
import logger from "@/lib/logger"
import { Settings } from "@/lib/settings-manager"

interface ModelConfig {
  provider: string
  modelId: string
}

export interface StreamingOptions {
  onToken?: (token: string) => void
  onFinish?: (result: any) => void
  onError?: (error: Error) => void
}

export interface ToolDefinition {
  name: string
  description: string
  parameters: z.ZodType<any>
  execute: (args: any, context?: { toolCallId: string; messages: CoreMessage[]; abortSignal: AbortSignal }) => Promise<any>
}

// Get the appropriate model client based on provider
async function getModelClient(modelConfig: ModelConfig) {
  switch (modelConfig.provider) {
    case 'amazon-bedrock': {
      const bedrockConfig = await Settings.getBedrock();
      
      if (!bedrockConfig.accessKeyId || !bedrockConfig.secretAccessKey || !bedrockConfig.region) {
        throw new Error('Amazon Bedrock is not configured. Please set the required settings in the admin panel.')
      }
      
      const bedrock = createAmazonBedrock({
        region: bedrockConfig.region,
        accessKeyId: bedrockConfig.accessKeyId,
        secretAccessKey: bedrockConfig.secretAccessKey
      })

      return bedrock(modelConfig.modelId)
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
  logger.info('[generateCompletion] SENDING TO LLM:', messages.map(m => `\n[${m.role}]\n${m.content}`).join('\n---\n'));
  
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
): Promise<StreamTextResult<Record<string, CoreTool>>> {
  
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
    logger.error('[streamCompletion] Error details:', {
      name: error instanceof Error ? error.name : 'Unknown',
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });
    throw error;
  }
}

// Generate a structured object
export async function generateStructuredOutput<T>(
  modelConfig: ModelConfig,
  messages: CoreMessage[],
  schema: z.ZodType<T>
): Promise<T> {
  logger.info('[generateStructuredOutput] Generating structured output');
  
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