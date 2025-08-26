import { streamText } from 'ai';
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
   * Get provider capabilities for a specific model
   */
  abstract getCapabilities(modelId: string): ProviderCapabilities;
  
  /**
   * Stream with provider-specific enhancements
   */
  async streamWithEnhancements(config: StreamConfig, callbacks: StreamingCallbacks = {}): Promise<any> {
    console.log('Starting stream with enhancements', {
      provider: this.providerName,
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
      console.error('Stream with enhancements failed:', error);
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