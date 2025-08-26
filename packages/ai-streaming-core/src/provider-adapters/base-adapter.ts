import { streamText, experimental_generateImage } from 'ai';
import { createLogger } from '../utils/logger';
import type { ProviderCapabilities, StreamConfig, StreamingCallbacks } from '../types';

/**
 * Base provider adapter with common functionality
 */
export abstract class BaseProviderAdapter {
  abstract providerName: string;
  
  /**
   * Create model instance for the provider
   */
  abstract createModel(modelId: string, options?: any): Promise<any>;
  
  /**
   * Create image model instance for the provider
   */
  abstract createImageModel(modelId: string, options?: any): Promise<any>;
  
  /**
   * Get provider capabilities for a specific model
   */
  abstract getCapabilities(modelId: string): ProviderCapabilities;
  
  /**
   * Stream with provider-specific enhancements
   */
  async streamWithEnhancements(config: StreamConfig, callbacks: StreamingCallbacks = {}): Promise<any> {
    const log = createLogger({ module: 'BaseProviderAdapter', provider: this.providerName });
    
    log.info('Starting stream with enhancements', {
      hasModel: !!config.model,
      messageCount: config.messages.length
    });
    
    try {
      // Start streaming with AI SDK
      const streamOptions: any = {
        model: config.model,
        messages: config.messages,
        ...(config.system && { system: config.system }),
        ...(config.tools && { tools: config.tools }),
        ...(config.temperature && { temperature: config.temperature }),
        ...(config.maxTokens && { maxTokens: config.maxTokens }),
        onFinish: async (finishResult: any) => {
          if (callbacks.onFinish) {
            await callbacks.onFinish({
              text: finishResult.text,
              usage: {
                promptTokens: finishResult.usage?.promptTokens || 0,
                completionTokens: finishResult.usage?.completionTokens || 0,
                totalTokens: finishResult.usage?.totalTokens || 0,
                ...(finishResult.experimental_providerMetadata?.openai?.reasoningTokens && {
                  reasoningTokens: finishResult.experimental_providerMetadata.openai.reasoningTokens
                })
              },
              finishReason: finishResult.finishReason
            });
          }
        }
      };
      
      // Add provider metadata if available
      if (config.providerOptions?.experimental_providerMetadata) {
        streamOptions.experimental_providerMetadata = config.providerOptions.experimental_providerMetadata;
      }
      
      const result = streamText(streamOptions);
      
      return result;
    } catch (error) {
      log.error('Stream with enhancements failed', { error });
      if (callbacks.onError) {
        callbacks.onError(error as Error);
      }
      throw error;
    }
  }
  
  /**
   * Generate image using provider-specific enhancements
   */
  async generateImageWithEnhancements(config: {
    model: any;
    prompt: string;
    size?: string;
    style?: string;
    providerOptions?: Record<string, any>;
  }, callbacks: { onError?: (error: Error) => void } = {}): Promise<any> {
    const log = createLogger({ module: 'BaseProviderAdapter', provider: this.providerName });
    
    log.info('Starting image generation with enhancements', {
      hasModel: !!config.model,
      prompt: config.prompt.substring(0, 100) + (config.prompt.length > 100 ? '...' : ''),
      size: config.size,
      style: config.style
    });
    
    try {
      // Generate image with AI SDK
      const generateOptions: any = {
        model: config.model,
        prompt: config.prompt,
        ...(config.size && { size: config.size }),
        ...(config.providerOptions && { providerOptions: config.providerOptions })
      };
      
      const result = await experimental_generateImage(generateOptions);
      
      log.info('Image generation completed', {
        hasImage: !!result.image,
        mediaType: result.image?.mediaType
      });
      
      return result;
    } catch (error) {
      log.error('Image generation failed', { error });
      if (callbacks.onError) {
        callbacks.onError(error as Error);
      }
      throw error;
    }
  }
  
  /**
   * Check if model ID matches any of the given patterns
   */
  protected matchesPattern(modelId: string, patterns: string[]): boolean {
    return patterns.some(pattern => {
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$', 'i');
      return regex.test(modelId);
    });
  }
  
  /**
   * Get provider-specific options for streaming
   */
  getProviderOptions(modelId: string, options?: any): Record<string, any> {
    return {};
  }
  
  /**
   * Check if this adapter supports the given model
   */
  supportsModel(modelId: string): boolean {
    return true; // Base implementation - override in subclasses
  }
}