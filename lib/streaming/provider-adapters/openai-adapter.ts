import { createOpenAI } from '@ai-sdk/openai';
import { createLogger } from '@/lib/logger';
import { Settings } from '@/lib/settings-manager';
import { ErrorFactories } from '@/lib/error-utils';
import { BaseProviderAdapter } from './base-adapter';
import type { ProviderCapabilities, StreamRequest, StreamConfig } from '../types';

const log = createLogger({ module: 'openai-adapter' });

/**
 * OpenAI provider adapter with support for:
 * - GPT-5, GPT-4, GPT-3.5, o3, o4 models
 * - OpenAI Responses API for reasoning models
 * - Background mode for long-running reasoning
 * - Enhanced reasoning support and token persistence
 */
export class OpenAIAdapter extends BaseProviderAdapter {
  protected providerName = 'openai';
  
  async createModel(modelId: string, options?: StreamRequest['options']) {
    try {
      const apiKey = await Settings.getOpenAI();
      if (!apiKey || typeof apiKey !== 'string' || apiKey.trim() === '') {
        log.error('OpenAI API key not configured or invalid');
        throw ErrorFactories.sysConfigurationError('OpenAI API key not configured');
      }
      
      log.debug(`Creating OpenAI model: ${modelId}`, {
        modelId,
        useResponsesAPI: this.shouldUseResponsesAPI(modelId),
        backgroundMode: options?.backgroundMode
      });
      
      const openai = createOpenAI({ apiKey });
      
      // Use Responses API for o-series and GPT-5 models
      if (this.shouldUseResponsesAPI(modelId)) {
        // Note: This is a future enhancement when AI SDK supports Responses API
        // For now, fall back to standard API but log the intention
        log.info('Model supports Responses API features', {
          modelId,
          reasoningEffort: options?.reasoningEffort,
          backgroundMode: options?.backgroundMode
        });
        
        // TODO: Implement Responses API when AI SDK supports it
        // return openai.responses(modelId, {
        //   reasoningEffort: options?.reasoningEffort || 'medium',
        //   backgroundMode: options?.backgroundMode || false,
        //   streamReasoningSummaries: true
        // });
      }
      
      return openai(modelId);
      
    } catch (error) {
      log.error('Failed to create OpenAI model', {
        modelId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }
  
  getCapabilities(modelId: string): ProviderCapabilities {
    // GPT-5 models
    if (this.matchesPattern(modelId, ['gpt-5*', 'gpt-5-*'])) {
      return {
        supportsReasoning: true,
        supportsThinking: false,
        supportedResponseModes: ['standard', 'flex', 'priority'],
        supportsBackgroundMode: true,
        supportedTools: ['web_search', 'code_interpreter', 'image_generation'],
        typicalLatencyMs: 3000,
        maxTimeoutMs: 300000, // 5 minutes
        costPerInputToken: 0.00001, // Estimated
        costPerOutputToken: 0.00003,
        costPerReasoningToken: 0.00002
      };
    }
    
    // o3/o4 reasoning models
    if (this.matchesPattern(modelId, ['o3*', 'o4*'])) {
      return {
        supportsReasoning: true,
        supportsThinking: false,
        supportedResponseModes: ['standard', 'flex', 'priority'],
        supportsBackgroundMode: true,
        supportedTools: ['web_search', 'code_interpreter'],
        typicalLatencyMs: 10000, // Much slower for reasoning
        maxTimeoutMs: 600000, // 10 minutes for complex reasoning
        costPerInputToken: 0.00015, // Higher cost for reasoning models
        costPerOutputToken: 0.0006,
        costPerReasoningToken: 0.0003
      };
    }
    
    // GPT-4 models
    if (this.matchesPattern(modelId, ['gpt-4*'])) {
      return {
        supportsReasoning: false,
        supportsThinking: false,
        supportedResponseModes: ['standard'],
        supportsBackgroundMode: false,
        supportedTools: ['code_interpreter'],
        typicalLatencyMs: 2000,
        maxTimeoutMs: 60000, // 1 minute
        costPerInputToken: 0.00003,
        costPerOutputToken: 0.00006
      };
    }
    
    // GPT-3.5 models
    if (this.matchesPattern(modelId, ['gpt-3.5*', 'gpt-35*'])) {
      return {
        supportsReasoning: false,
        supportsThinking: false,
        supportedResponseModes: ['standard'],
        supportsBackgroundMode: false,
        supportedTools: [],
        typicalLatencyMs: 1000,
        maxTimeoutMs: 30000, // 30 seconds
        costPerInputToken: 0.0000005,
        costPerOutputToken: 0.0000015
      };
    }
    
    // Default for unknown OpenAI models
    return {
      ...this.getDefaultCapabilities(),
      supportedTools: ['code_interpreter']
    };
  }
  
  getProviderOptions(modelId: string, options?: StreamRequest['options']): Record<string, any> {
    const baseOptions = super.getProviderOptions(modelId, options);
    
    // Add OpenAI-specific options
    const openaiOptions: Record<string, any> = {
      ...baseOptions
    };
    
    // Configure for Responses API models
    if (this.shouldUseResponsesAPI(modelId)) {
      openaiOptions.openai = {
        // Reasoning configuration
        reasoningEffort: options?.reasoningEffort || 'medium',
        backgroundMode: options?.backgroundMode || false,
        includeReasoningSummaries: true,
        preserveReasoningItems: true, // For multi-turn conversations
        
        // Tool configuration
        enableWebSearch: options?.enableWebSearch || false,
        enableCodeInterpreter: options?.enableCodeInterpreter || false,
        enableImageGeneration: options?.enableImageGeneration || false
      };
    }
    
    return openaiOptions;
  }
  
  protected enhanceStreamConfig(config: StreamConfig): any {
    const enhanced = super.enhanceStreamConfig(config);
    
    // Add provider-specific options to providerOptions
    if (config.providerOptions) {
      enhanced.providerOptions = config.providerOptions;
    }
    
    return enhanced;
  }
  
  supportsModel(modelId: string): boolean {
    const supportedPatterns = [
      'gpt-3.5*',
      'gpt-35*', 
      'gpt-4*',
      'gpt-5*',
      'o3*',
      'o4*',
      'text-davinci*',
      'text-curie*',
      'text-babbage*',
      'text-ada*'
    ];
    
    return this.matchesPattern(modelId, supportedPatterns);
  }
  
  /**
   * Determine if model should use OpenAI Responses API
   */
  private shouldUseResponsesAPI(modelId: string): boolean {
    const responsesAPIModels = [
      'gpt-5*',
      'gpt-5-*',
      'gpt-4.1*',
      'o3*',
      'o4*'
    ];
    
    return this.matchesPattern(modelId, responsesAPIModels);
  }
  
  protected async handleFinish(data: any, callbacks: any): Promise<void> {
    await super.handleFinish(data, callbacks);
    
    // Handle OpenAI-specific reasoning content
    if (data.reasoning && callbacks.onReasoning) {
      callbacks.onReasoning(data.reasoning);
    }
    
    // Handle background job completion
    if (data.backgroundJobId && data.backgroundJobStatus === 'completed') {
      log.info('Background reasoning job completed', {
        jobId: data.backgroundJobId,
        model: data.model
      });
    }
  }
}