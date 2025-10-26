import { createOpenAI } from '@ai-sdk/openai';
import { createLogger } from '@/lib/logger';
import { Settings } from '@/lib/settings-manager';
import { ErrorFactories } from '@/lib/error-utils';
import { BaseProviderAdapter } from './base-adapter';
import type { ProviderCapabilities, StreamRequest } from '../types';

const log = createLogger({ module: 'latimer-adapter' });

/**
 * Latimer AI provider adapter
 * Utilizes OpenAI-compatible API with custom endpoint
 */
export class LatimerAdapter extends BaseProviderAdapter {
  protected providerName = 'latimer';
  private latimerClient?: ReturnType<typeof createOpenAI>;

  async createModel(modelId: string, options?: StreamRequest['options']) {
    try {
      const apiKey = await Settings.getLatimer();
      if (!apiKey || typeof apiKey !== 'string' || apiKey.trim() === '') {
        log.error('Latimer API key not configured or invalid');
        throw ErrorFactories.sysConfigurationError('Latimer API key not configured');
      }

      // Create OpenAI-compatible client with Latimer endpoint
      this.latimerClient = createOpenAI({
        apiKey,
        baseURL: 'https://api.latimer.ai/v1'
      });
      this.providerClient = this.latimerClient;

      log.info('Creating Latimer model', {
        modelId,
        hasOptions: !!options
      });
      return this.latimerClient(modelId);

    } catch (error) {
      log.error('Failed to create Latimer model', {
        modelId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  getCapabilities(modelId: string): ProviderCapabilities {
    log.debug('Getting capabilities for Latimer model', { modelId });

    // Default capabilities for Latimer models
    // These can be refined once we have more specific model information
    return {
      supportsReasoning: false,
      supportsThinking: false,
      supportedResponseModes: ['standard'],
      supportsBackgroundMode: false,
      supportedTools: [],
      typicalLatencyMs: 2000,
      maxTimeoutMs: 60000 // 1 minute
    };
  }

  getSupportedTools(modelId: string): string[] {
    log.debug('Getting supported tools for Latimer model', { modelId });

    // Latimer currently doesn't support native tools
    return [];
  }

  supportsModel(modelId: string): boolean {
    log.debug('Checking model support', { modelId, provider: 'latimer' });

    // Support all Latimer models (they use OpenAI-compatible format)
    // Pattern: latimer-*, or any model name from Latimer API
    return true; // Allow all models - validation happens at API level
  }
}
