import { createAzure } from '@ai-sdk/azure';
import { BaseProviderAdapter } from './base-adapter';
import { createLogger } from '../utils/logger';
import type { ProviderCapabilities } from '../types';
import type { SettingsManager } from '../utils/settings-manager';

/**
 * Azure OpenAI provider adapter with support for:
 * - GPT-4, GPT-4 Turbo, GPT-3.5 Turbo via Azure
 * - Custom deployment names
 * - Azure-specific configurations
 */
export class AzureAdapter extends BaseProviderAdapter {
  providerName = 'azure';
  private settingsManager?: SettingsManager;
  
  constructor(settingsManager?: SettingsManager) {
    super();
    this.settingsManager = settingsManager;
  }
  
  async createModel(modelId: string, options?: any): Promise<any> {
    const log = createLogger({ module: 'AzureAdapter' });
    log.info('Creating Azure model', { modelId, options });
    
    try {
      // Get Azure configuration from settings manager only
      if (!this.settingsManager) {
        throw new Error('Settings manager not configured');
      }
      
      const azureApiKey = await this.settingsManager.getSetting('AZURE_OPENAI_KEY');
      const azureBaseURL = await this.settingsManager.getSetting('AZURE_OPENAI_ENDPOINT');
      
      if (!azureApiKey || !azureBaseURL) {
        throw new Error('Azure API key or endpoint not configured');
      }
      
      const azure = createAzure({
        apiKey: azureApiKey,
        baseURL: azureBaseURL
      });
      
      const model = azure(modelId);
      
      log.info('Azure model created successfully', { modelId });
      return model;
      
    } catch (error) {
      log.error('Failed to create Azure model', {
        modelId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }
  
  getCapabilities(modelId: string): ProviderCapabilities {
    // GPT-4 models via Azure
    if (this.matchesPattern(modelId, ['gpt-4*'])) {
      const isTurbo = this.matchesPattern(modelId, ['*turbo*']);
      
      return {
        supportsReasoning: false,
        supportsThinking: false,
        supportedResponseModes: ['standard'],
        supportsBackgroundMode: false,
        supportedTools: [],
        typicalLatencyMs: isTurbo ? 1500 : 2000,
        maxTimeoutMs: 60000, // 1 minute
        costPerInputToken: isTurbo ? 0.00001 : 0.00003,
        costPerOutputToken: isTurbo ? 0.00002 : 0.00006
      };
    }
    
    // GPT-3.5 Turbo via Azure
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
    
    // Default capabilities for unknown Azure models
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
    // Azure doesn't have special provider options currently
    return {};
  }
  
  supportsModel(modelId: string): boolean {
    return this.matchesPattern(modelId, [
      'gpt-4*',
      'gpt-3.5*',
      'gpt-35*'
    ]);
  }
}