import { streamText, consumeStream, type LanguageModel, type CoreMessage } from 'ai';
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
  getProviderOptions(modelId: string, options?: StreamRequest['options']): Record<string, unknown> {
    const baseOptions: Record<string, unknown> = {};
    
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
  ): Promise<{
    toDataStreamResponse: (options?: { headers?: Record<string, string> }) => Response;
    toUIMessageStreamResponse: (options?: { headers?: Record<string, string> }) => Response;
    usage: Promise<{
      totalTokens?: number;
      promptTokens?: number;
      completionTokens?: number;
      reasoningTokens?: number;
      totalCost?: number;
    }>;
  }> {
    const logger = createLogger({ 
      module: `${this.providerName}-adapter`,
      requestId: config.experimental_telemetry?.metadata?.['request.id'] as string | undefined
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
        model: enhancedConfig.model,
        messages: enhancedConfig.messages as CoreMessage[],
        system: enhancedConfig.system,
        temperature: enhancedConfig.temperature,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        experimental_telemetry: enhancedConfig.experimental_telemetry as any,
        onFinish: async (event) => {
          logger.info('streamText onFinish triggered', {
            provider: this.providerName,
            hasText: !!event.text,
            hasUsage: !!event.usage,
            finishReason: event.finishReason,
            textLength: event.text?.length || 0
          });
          
          // Transform to our expected format
          const transformedData = {
            text: event.text || '',
            usage: event.usage ? {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              promptTokens: (event.usage as any).promptTokens || 0,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              completionTokens: (event.usage as any).completionTokens || 0,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              totalTokens: (event.usage as any).totalTokens || 0
            } : undefined,
            finishReason: event.finishReason || 'stop'
          };
          
          // Call provider-specific finish handler
          await this.handleFinish(transformedData, callbacks);
          
          // Call user's finish callback
          if (callbacks.onFinish) {
            logger.info('Calling user onFinish callback from streamText', { 
              hasCallback: true,
              textLength: event.text?.length || 0 
            });
            await callbacks.onFinish(transformedData);
          }
        },
        onError: (event) => {
          const error = event.error instanceof Error ? event.error : new Error(String(event.error));
          
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
      
      return {
        toDataStreamResponse: (options?: { headers?: Record<string, string> }) => 
          result.toUIMessageStreamResponse ? result.toUIMessageStreamResponse(options) : result.toTextStreamResponse(options),
        toUIMessageStreamResponse: (options?: { headers?: Record<string, string> }) => 
          result.toUIMessageStreamResponse ? result.toUIMessageStreamResponse(options) : result.toTextStreamResponse(options),
        usage: result.usage
      };
      
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
  protected enhanceStreamConfig(config: StreamConfig): StreamConfig {
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
  protected handleStreamProgress(result: unknown, callbacks: StreamingCallbacks): void {
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
  protected async handleFinish(
    data: {
      text: string;
      usage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
        reasoningTokens?: number;
        totalCost?: number;
      };
      finishReason: string;
    },
    callbacks: StreamingCallbacks
  ): Promise<void> {
    // Provider-specific handlers can override this to extract special content
    // For example, Claude might extract thinking content
  }
  
  /**
   * Handle stream error event
   * Can be overridden by specific providers
   */
  protected handleError(error: Error, callbacks: StreamingCallbacks): void {
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