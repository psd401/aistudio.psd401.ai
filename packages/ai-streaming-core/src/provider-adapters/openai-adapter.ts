import { createOpenAI } from '@ai-sdk/openai';
import { BaseProviderAdapter } from './base-adapter';
import type { ProviderCapabilities } from '../types';
import type { SettingsManager } from '../utils/settings-manager';

/**
 * OpenAI provider adapter with support for:
 * - GPT-4, GPT-4 Turbo, GPT-3.5 Turbo
 * - GPT-5 with reasoning capabilities  
 * - o1 models with reasoning
 * - Native tools (web search, code interpreter)
 */
export class OpenAIAdapter extends BaseProviderAdapter {
  providerName = 'openai';
  private settingsManager?: SettingsManager;
  
  constructor(settingsManager?: SettingsManager) {
    super();
    this.settingsManager = settingsManager;
  }
  
  async createModel(modelId: string, options?: any): Promise<any> {
    console.log('Creating OpenAI model:', modelId, { options });
    
    try {
      // Get OpenAI API key from settings manager only
      if (!this.settingsManager) {
        throw new Error('Settings manager not configured');
      }
      
      const apiKey = await this.settingsManager.getSetting('OPENAI_API_KEY');
      if (!apiKey) {
        throw new Error('OpenAI API key not configured');
      }
      
      const openai = createOpenAI({ apiKey });
      const model = openai(modelId);
      
      console.log('OpenAI model created successfully:', modelId);
      return model;
      
    } catch (error) {
      console.error('Failed to create OpenAI model:', {
        modelId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }
  
  getCapabilities(modelId: string): ProviderCapabilities {
    // GPT-5 models with reasoning capabilities
    if (this.matchesPattern(modelId, ['gpt-5*'])) {
      return {
        supportsReasoning: true,
        supportsThinking: false, // GPT-5 uses reasoning, not thinking
        supportedResponseModes: ['standard'],
        supportsBackgroundMode: false,
        supportedTools: ['web_search', 'code_interpreter'],
        typicalLatencyMs: 2000,
        maxTimeoutMs: 300000, // 5 minutes for reasoning models
        costPerInputToken: 0.00001, // Estimated
        costPerOutputToken: 0.00003
      };
    }
    
    // o1 models with reasoning
    if (this.matchesPattern(modelId, ['o1*'])) {
      return {
        supportsReasoning: true,
        supportsThinking: false,
        supportedResponseModes: ['standard'],
        supportsBackgroundMode: false,
        supportedTools: [],
        typicalLatencyMs: 3000,
        maxTimeoutMs: 300000, // 5 minutes for complex reasoning
        costPerInputToken: 0.000015,
        costPerOutputToken: 0.00006
      };
    }
    
    // GPT-4 models
    if (this.matchesPattern(modelId, ['gpt-4*'])) {
      const isTurbo = this.matchesPattern(modelId, ['*turbo*']);
      
      return {
        supportsReasoning: false,
        supportsThinking: false,
        supportedResponseModes: ['standard'],
        supportsBackgroundMode: false,
        supportedTools: ['web_search', 'code_interpreter'],
        typicalLatencyMs: isTurbo ? 1500 : 2000,
        maxTimeoutMs: 60000, // 1 minute
        costPerInputToken: isTurbo ? 0.00001 : 0.00003,
        costPerOutputToken: isTurbo ? 0.00002 : 0.00006
      };
    }
    
    // GPT-3.5 Turbo
    if (this.matchesPattern(modelId, ['gpt-3.5*', 'gpt-35*'])) {
      return {
        supportsReasoning: false,
        supportsThinking: false,
        supportedResponseModes: ['standard'],
        supportsBackgroundMode: false,
        supportedTools: [],
        typicalLatencyMs: 1000,
        maxTimeoutMs: 30000, // 30 seconds
        costPerInputToken: 0.0000015,
        costPerOutputToken: 0.000002
      };
    }
    
    // Default capabilities for unknown models
    return {
      supportsReasoning: false,
      supportsThinking: false,
      supportedResponseModes: ['standard'],
      supportsBackgroundMode: false,
      supportedTools: [],
      typicalLatencyMs: 2000,
      maxTimeoutMs: 60000
    };
  }
  
  getProviderOptions(modelId: string, options?: any): Record<string, any> {
    const providerOptions: Record<string, any> = {};
    
    // Handle reasoning effort for GPT-5 and o1 models
    if (options?.reasoningEffort && this.matchesPattern(modelId, ['gpt-5*', 'o1*'])) {
      providerOptions.experimental_providerMetadata = {
        openai: {
          reasoningEffort: options.reasoningEffort
        }
      };
    }
    
    return providerOptions;
  }
  
  supportsModel(modelId: string): boolean {
    return this.matchesPattern(modelId, [
      'gpt-5*',
      'gpt-4*', 
      'gpt-3.5*',
      'gpt-35*',
      'o1*'
    ]);
  }
}