import { createAzure } from '@ai-sdk/azure';
import { createLogger } from '@/lib/logger';
import { Settings } from '@/lib/settings-manager';
import { ErrorFactories } from '@/lib/error-utils';
import { BaseProviderAdapter } from './base-adapter';
import type { ProviderCapabilities, StreamRequest } from '../types';

const log = createLogger({ module: 'azure-adapter' });

/**
 * Azure OpenAI provider adapter
 * Supports Azure-hosted OpenAI models with enterprise features
 */
export class AzureAdapter extends BaseProviderAdapter {
  protected providerName = 'azure';
  
  async createModel(modelId: string, options?: StreamRequest['options']) {
    try {
      const config = await Settings.getAzureOpenAI();
      if (!config.key || !config.resourceName) {
        log.error('Azure OpenAI not configured');
        throw ErrorFactories.sysConfigurationError('Azure OpenAI not configured');
      }
      
      log.debug(`Creating Azure model: ${modelId}`, { 
        modelId,
        resourceName: config.resourceName
      });
      
      const azure = createAzure({
        apiKey: config.key,
        resourceName: config.resourceName
      });
      
      return azure(modelId);
      
    } catch (error) {
      log.error('Failed to create Azure model', {
        modelId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }
  
  getCapabilities(modelId: string): ProviderCapabilities {
    // Azure typically hosts OpenAI models, so capabilities are similar
    // but may have enterprise-specific differences
    
    // GPT-4 models on Azure
    if (this.matchesPattern(modelId, ['gpt-4*'])) {
      return {
        supportsReasoning: false,
        supportsThinking: false,
        supportedResponseModes: ['standard'],
        supportsBackgroundMode: false,
        supportedTools: ['code_interpreter'], // If enabled in Azure deployment
        typicalLatencyMs: 2500, // Slightly higher latency than OpenAI direct
        maxTimeoutMs: 60000, // 1 minute
        costPerInputToken: 0.00003, // Azure pricing
        costPerOutputToken: 0.00006
      };
    }
    
    // GPT-3.5 models on Azure
    if (this.matchesPattern(modelId, ['gpt-35*', 'gpt-3.5*'])) {
      return {
        supportsReasoning: false,
        supportsThinking: false,
        supportedResponseModes: ['standard'],
        supportsBackgroundMode: false,
        supportedTools: [],
        typicalLatencyMs: 1500,
        maxTimeoutMs: 30000, // 30 seconds
        costPerInputToken: 0.0000005,
        costPerOutputToken: 0.0000015
      };
    }
    
    // Legacy text models on Azure
    if (this.matchesPattern(modelId, ['text-davinci*', 'text-curie*', 'text-babbage*', 'text-ada*'])) {
      return {
        supportsReasoning: false,
        supportsThinking: false,
        supportedResponseModes: ['standard'],
        supportsBackgroundMode: false,
        supportedTools: [],
        typicalLatencyMs: 2000,
        maxTimeoutMs: 30000, // 30 seconds
        costPerInputToken: 0.000002,
        costPerOutputToken: 0.000002
      };
    }
    
    // Default for unknown Azure models
    return this.getDefaultCapabilities();
  }
  
  getProviderOptions(modelId: string, options?: StreamRequest['options']): Record<string, any> {
    const baseOptions = super.getProviderOptions(modelId, options);
    
    // Add Azure-specific options
    const azureOptions: Record<string, any> = {
      ...baseOptions
    };
    
    // Azure-specific configurations
    azureOptions.azure = {
      // Enterprise features
      contentFiltering: true, // Azure has built-in content filtering
      dataProcessingOptOut: true, // For enterprise privacy
      
      // Performance configurations
      deploymentRegion: process.env.AZURE_OPENAI_REGION || 'eastus'
    };
    
    return azureOptions;
  }
  
  supportsModel(modelId: string): boolean {
    const supportedPatterns = [
      'gpt-3.5*',
      'gpt-35*',
      'gpt-4*',
      'text-davinci*',
      'text-curie*',
      'text-babbage*',
      'text-ada*',
      'code-davinci*',
      'code-cushman*'
    ];
    
    return this.matchesPattern(modelId, supportedPatterns);
  }
  
  protected async handleFinish(data: any, callbacks: any): Promise<void> {
    await super.handleFinish(data, callbacks);
    
    // Handle Azure-specific content filtering results
    if (data.contentFilterResults && callbacks.onProgress) {
      callbacks.onProgress({
        type: 'tool_result',
        content: `Content filtering: ${JSON.stringify(data.contentFilterResults)}`,
        timestamp: Date.now(),
        metadata: { 
          tool: 'content_filter',
          azure: true
        }
      });
    }
  }
  
  protected handleError(error: Error, callbacks: any): void {
    super.handleError(error, callbacks);
    
    // Handle Azure-specific errors
    if (error.message.includes('content_filter')) {
      log.warn('Azure content filter triggered', {
        error: error.message
      });
    }
    
    if (error.message.includes('quota_exceeded')) {
      log.warn('Azure quota exceeded', {
        error: error.message
      });
    }
    
    if (error.message.includes('deployment_not_found')) {
      log.error('Azure deployment not found', {
        error: error.message
      });
    }
  }
}