import { streamText, type LanguageModel } from 'ai';
import { createLogger } from '@/lib/logger';
import type { 
  ProviderAdapter, 
  ProviderCapabilities, 
  StreamConfig, 
  StreamingCallbacks,
  StreamRequest 
} from '../types';

const log = createLogger({ module: 'base-provider-adapter' });

/**
 * Base class for all provider adapters
 * Provides common functionality and interface implementation
 */
export abstract class BaseProviderAdapter implements ProviderAdapter {
  protected abstract providerName: string;
  
  /**
   * Create a model instance for this provider
   * Must be implemented by each provider
   */
  abstract createModel(modelId: string, options?: StreamRequest['options']): Promise<LanguageModel>;
  
  /**
   * Get capabilities for a specific model
   * Must be implemented by each provider
   */
  abstract getCapabilities(modelId: string): ProviderCapabilities;
  
  /**
   * Get provider-specific options for streaming
   * Can be overridden by specific providers
   */
  getProviderOptions(modelId: string, options?: StreamRequest['options']): Record<string, any> {
    const baseOptions: Record<string, any> = {};
    
    // Add common options
    if (options?.reasoningEffort) {
      baseOptions.reasoningEffort = options.reasoningEffort;
    }
    
    if (options?.responseMode) {
      baseOptions.responseMode = options.responseMode;
    }
    
    if (options?.backgroundMode) {
      baseOptions.backgroundMode = options.backgroundMode;
    }
    
    return baseOptions;
  }
  
  /**
   * Stream with provider-specific enhancements
   * Base implementation using AI SDK streamText
   * Can be overridden for provider-specific features
   */
  async streamWithEnhancements(
    config: StreamConfig,
    callbacks: StreamingCallbacks
  ): Promise<any> {
    const logger = createLogger({ 
      module: `${this.providerName}-adapter`,
      requestId: config.experimental_telemetry?.metadata?.['request.id']
    });
    
    logger.debug('Starting stream with enhancements', {
      provider: this.providerName,
      hasModel: !!config.model,
      messageCount: config.messages.length,
      hasSystem: !!config.system,
      hasTelemetry: !!config.experimental_telemetry?.isEnabled
    });
    
    try {
      // Create enhanced configuration
      const enhancedConfig = this.enhanceStreamConfig(config);
      
      // Start streaming with AI SDK
      const result = streamText({
        ...enhancedConfig,
        onFinish: async (data: any) => {
          logger.debug('Stream finished', {
            provider: this.providerName,
            tokensUsed: data.usage?.totalTokens || 0,
            finishReason: data.finishReason || 'unknown'
          });
          
          // Transform usage data to expected format
          const transformedData = {
            text: data.text || '',
            usage: data.usage ? {
              promptTokens: data.usage.promptTokens || 0,
              completionTokens: data.usage.completionTokens || 0,
              totalTokens: data.usage.totalTokens || 0,
              reasoningTokens: data.usage.reasoningTokens,
              totalCost: data.usage.totalCost
            } : undefined,
            finishReason: data.finishReason || 'unknown'
          };
          
          // Call provider-specific finish handler for internal processing
          await this.handleFinish(transformedData, callbacks);
          
          // Call user's finish callback - this is handled by the unified streaming service now
          // The callback will be called from the unified service layer
          if (callbacks.onFinish) {
            await callbacks.onFinish(transformedData);
          }
        },
        onError: (errorData: any) => {
          const error = errorData instanceof Error ? errorData : 
                       errorData.error instanceof Error ? errorData.error :
                       new Error(String(errorData.error || errorData));
          
          logger.error('Stream error', {
            provider: this.providerName,
            error: error.message
          });
          
          // Call provider-specific error handler
          this.handleError(error, callbacks);
          
          // Call user's error callback
          if (callbacks.onError) {
            callbacks.onError(error);
          }
        }
      });
      
      // Handle streaming chunks for progress tracking
      this.handleStreamProgress(result, callbacks);
      
      return result;
      
    } catch (error) {
      logger.error('Failed to start stream', {
        provider: this.providerName,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }
  
  /**
   * Validate if this adapter supports the given model
   * Must be implemented by each provider
   */
  abstract supportsModel(modelId: string): boolean;
  
  /**
   * Enhance the stream configuration with provider-specific options
   * Can be overridden by specific providers
   */
  protected enhanceStreamConfig(config: StreamConfig): any {
    return {
      model: config.model,
      messages: config.messages,
      system: config.system,
      maxTokens: config.maxTokens,
      temperature: config.temperature,
      experimental_telemetry: config.experimental_telemetry
    };
  }
  
  /**
   * Handle streaming progress for callbacks
   * Can be overridden by specific providers for custom progress handling
   */
  protected handleStreamProgress(result: any, callbacks: StreamingCallbacks): void {
    // Base implementation - providers can override for custom progress tracking
    if (callbacks.onProgress) {
      // This would need to be implemented based on AI SDK streaming capabilities
      // For now, this is a placeholder for the interface
    }
  }
  
  /**
   * Handle stream finish event
   * Can be overridden by specific providers
   */
  protected async handleFinish(data: any, callbacks: StreamingCallbacks): Promise<void> {
    // Extract reasoning content if available
    if (data.experimental_reasoningContent && callbacks.onReasoning) {
      callbacks.onReasoning(data.experimental_reasoningContent);
    }
    
    // Extract thinking content if available (Claude-specific)
    if (data.experimental_thinkingContent && callbacks.onThinking) {
      callbacks.onThinking(data.experimental_thinkingContent);
    }
  }
  
  /**
   * Handle stream error event
   * Can be overridden by specific providers
   */
  protected handleError(error: Error, callbacks: any): void {
    // Base error handling - log the error
    log.error(`${this.providerName} adapter error`, {
      error: error.message,
      provider: this.providerName
    });
  }
  
  /**
   * Get default capabilities for unknown models
   * Used as fallback when specific model capabilities are unknown
   */
  protected getDefaultCapabilities(): ProviderCapabilities {
    return {
      supportsReasoning: false,
      supportsThinking: false,
      supportedResponseModes: ['standard'],
      supportsBackgroundMode: false,
      supportedTools: [],
      typicalLatencyMs: 2000,
      maxTimeoutMs: 30000
    };
  }
  
  /**
   * Check if a model ID matches a pattern
   */
  protected matchesPattern(modelId: string, patterns: string[]): boolean {
    return patterns.some(pattern => {
      if (pattern.includes('*')) {
        const regex = new RegExp(pattern.replace(/\*/g, '.*'), 'i');
        return regex.test(modelId);
      }
      return modelId.toLowerCase().includes(pattern.toLowerCase());
    });
  }
}