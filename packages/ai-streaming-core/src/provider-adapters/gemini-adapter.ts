import { google, createGoogleGenerativeAI } from '@ai-sdk/google';
import { BaseProviderAdapter } from './base-adapter';
import { createLogger } from '../utils/logger';
import type { ProviderCapabilities } from '../types';
import type { SettingsManager } from '../utils/settings-manager';

/**
 * Google Gemini provider adapter with support for:
 * - Gemini 2.0 Flash
 * - Gemini 1.5 Pro and Flash
 * - Gemini 1.0 Pro
 */
export class GeminiAdapter extends BaseProviderAdapter {
  providerName = 'google';
  private settingsManager?: SettingsManager;
  
  constructor(settingsManager?: SettingsManager) {
    super();
    this.settingsManager = settingsManager;
  }
  
  async createModel(modelId: string, options?: any): Promise<any> {
    const log = createLogger({ module: 'GeminiAdapter' });
    log.info('Creating Google model', { modelId, options });
    
    try {
      // Get Google API key from settings manager only
      if (!this.settingsManager) {
        throw new Error('Settings manager not configured');
      }
      
      const googleApiKey = await this.settingsManager.getSetting('GOOGLE_API_KEY');
      if (!googleApiKey) {
        throw new Error('Google API key not configured');
      }
      
      // Set API key for Google SDK
      process.env.GOOGLE_GENERATIVE_AI_API_KEY = googleApiKey;
      
      const model = google(modelId);
      
      log.info('Google model created successfully', { modelId });
      return model;
      
    } catch (error) {
      log.error('Failed to create Google model', {
        modelId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }
  
  async createImageModel(modelId: string, options?: any): Promise<any> {
    const log = createLogger({ module: 'GeminiAdapter' });
    log.info('Creating Google image model', { modelId, options });
    
    try {
      // Get Google API key from settings manager only
      if (!this.settingsManager) {
        throw new Error('Settings manager not configured');
      }
      
      const apiKey = await this.settingsManager.getSetting('GOOGLE_API_KEY');
      if (!apiKey) {
        throw new Error('Google API key not configured');
      }
      
      const google = createGoogleGenerativeAI({ apiKey });
      const imageModel = google.image(modelId);
      
      log.info('Google image model created successfully', { modelId });
      return imageModel;
      
    } catch (error) {
      log.error('Failed to create Google image model', {
        modelId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }
  
  getCapabilities(modelId: string): ProviderCapabilities {
    // Base capabilities shared by all Gemini models
    const baseCapabilities: ProviderCapabilities = {
      supportsReasoning: false,
      supportsThinking: false,
      supportedResponseModes: ['standard'],
      supportsBackgroundMode: false,
      supportedTools: [],
      typicalLatencyMs: 2000,
      maxTimeoutMs: 60000
    };

    // Gemini 2.5 Flash (including image models) - same as 1.5 Pro pricing/latency
    if (this.matchesPattern(modelId, ['gemini-2.5*', 'models/gemini-2.5*'])) {
      return {
        ...baseCapabilities,
        costPerInputToken: 0.00000125,
        costPerOutputToken: 0.00000375
      };
    }
    
    // Gemini 2.0 Flash - faster latency
    if (this.matchesPattern(modelId, ['gemini-2.0*', 'models/gemini-2.0*'])) {
      return {
        ...baseCapabilities,
        typicalLatencyMs: 1500,
        costPerInputToken: 0.00000125,
        costPerOutputToken: 0.00000375
      };
    }
    
    // Gemini 1.5 Pro - standard capabilities
    if (this.matchesPattern(modelId, ['gemini-1.5-pro*', 'models/gemini-1.5-pro*'])) {
      return {
        ...baseCapabilities,
        costPerInputToken: 0.00000125,
        costPerOutputToken: 0.00000375
      };
    }
    
    // Gemini 1.5 Flash - faster, cheaper
    if (this.matchesPattern(modelId, ['gemini-1.5-flash*', 'models/gemini-1.5-flash*'])) {
      return {
        ...baseCapabilities,
        typicalLatencyMs: 1000,
        maxTimeoutMs: 30000, // 30 seconds
        costPerInputToken: 0.000000075,
        costPerOutputToken: 0.0000003
      };
    }
    
    // Gemini 1.0 Pro - slower, cheaper
    if (this.matchesPattern(modelId, ['gemini-pro*', 'gemini-1.0-pro*', 'models/gemini-pro*'])) {
      return {
        ...baseCapabilities,
        typicalLatencyMs: 2500,
        costPerInputToken: 0.0000005,
        costPerOutputToken: 0.0000015
      };
    }
    
    // Default capabilities for unknown Gemini models
    return baseCapabilities;
  }
  
  getProviderOptions(modelId: string, options?: any): Record<string, any> {
    // Google models don't have special provider options currently
    return {};
  }
  
  supportsModel(modelId: string): boolean {
    return this.matchesPattern(modelId, [
      'gemini-*',
      'models/gemini-*'
    ]);
  }
}