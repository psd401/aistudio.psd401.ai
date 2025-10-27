import { type LanguageModel, type CoreMessage } from 'ai';
import { createLogger } from '@/lib/logger';
import { Settings } from '@/lib/settings-manager';
import { ErrorFactories } from '@/lib/error-utils';
import { BaseProviderAdapter } from './base-adapter';
import type { ProviderCapabilities, StreamRequest, StreamConfig, StreamingCallbacks } from '../types';

const log = createLogger({ module: 'latimer-adapter' });

/**
 * Latimer AI provider adapter
 * Uses custom Latimer API (NOT OpenAI-compatible)
 * API: POST https://api.latimer.ai/getCompletion
 */
export class LatimerAdapter extends BaseProviderAdapter {
  protected providerName = 'latimer';
  private apiKey?: string;

  async createModel(modelId: string, options?: StreamRequest['options']): Promise<LanguageModel> {
    try {
      const apiKey = await Settings.getLatimer();
      if (!apiKey || typeof apiKey !== 'string' || apiKey.trim() === '') {
        log.error('Latimer API key not configured or invalid');
        throw ErrorFactories.sysConfigurationError('Latimer API key not configured');
      }

      this.apiKey = apiKey;

      log.info('Creating Latimer model', {
        modelId,
        hasOptions: !!options
      });

      // Latimer uses custom API, not AI SDK
      // Return modelId as LanguageModel (string type is valid per AI SDK v5)
      return modelId as LanguageModel;

    } catch (error) {
      log.error('Failed to create Latimer model', {
        modelId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Override streamWithEnhancements to use Latimer's custom API
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
    }>;
  }> {
    // Extract model ID (config.model can be string or object)
    const modelId = typeof config.model === 'string' ? config.model : config.model.modelId;

    log.info('Calling Latimer API', {
      model: modelId,
      messageCount: config.messages.length
    });

    try {
      const apiKey = this.apiKey || await Settings.getLatimer();
      if (!apiKey) {
        throw ErrorFactories.sysConfigurationError('Latimer API key not configured');
      }

      // Convert AI SDK format to Latimer format
      const latimerMessages = config.messages.map((msg: CoreMessage) => ({
        role: msg.role,
        content: typeof msg.content === 'string' ? msg.content :
          msg.content.map((part: { type: string; text?: string }) => part.text).join('')
      }));

      const lastMessage = latimerMessages[latimerMessages.length - 1];
      const additionalMessages = latimerMessages.slice(0, -1);

      // Build payload - only include additionalMessages if not empty
      const payload: {
        apiKey: string;
        message: string;
        model: string;
        additionalMessages?: Array<{ role: string; content: string }>;
        modelTemperature: number;
      } = {
        apiKey,
        message: lastMessage?.content || '',
        model: modelId,
        modelTemperature: config.temperature || 0.7
      };

      // Only add additionalMessages if there are previous messages
      if (additionalMessages.length > 0) {
        payload.additionalMessages = additionalMessages;
      }

      log.debug('Latimer API request', {
        model: payload.model,
        messageCount: additionalMessages.length + 1
      });

      const response = await fetch('https://api.latimer.ai/getCompletion', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorText = await response.text();
        log.error('Latimer API error', {
          status: response.status,
          statusText: response.statusText,
          error: errorText
        });
        throw new Error(`Latimer API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      log.info('Latimer API response received', {
        chatId: data.chatId,
        totalUsage: data.totalUsage,
        billedAmount: data.billedAmount
      });

      // Call onFinish callback with the response
      const fullText = data.message?.content || '';

      if (callbacks.onFinish) {
        await callbacks.onFinish({
          text: fullText,
          usage: {
            totalTokens: data.totalUsage || 0,
            promptTokens: data.inputUsage || 0,
            completionTokens: data.completionUsage || 0
          },
          finishReason: 'stop'
        });
      }

      // Create AI SDK compatible data stream
      // Format: data stream events for text chunks
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          // Send text delta event (AI SDK format)
          const textEvent = `0:"${fullText.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"\n`;
          controller.enqueue(encoder.encode(textEvent));
          controller.close();
        }
      });

      return {
        toDataStreamResponse: (options?: { headers?: Record<string, string> }) => {
          return new Response(stream, {
            headers: {
              'Content-Type': 'text/plain; charset=utf-8',
              'X-Vercel-AI-Data-Stream': 'v1',
              ...options?.headers
            }
          });
        },
        toUIMessageStreamResponse: (options?: { headers?: Record<string, string> }) => {
          return new Response(stream, {
            headers: {
              'Content-Type': 'text/plain; charset=utf-8',
              'X-Vercel-AI-Data-Stream': 'v1',
              ...options?.headers
            }
          });
        },
        usage: Promise.resolve({
          totalTokens: data.totalUsage || 0,
          promptTokens: data.inputUsage || 0,
          completionTokens: data.completionUsage || 0
        })
      };

    } catch (error) {
      log.error('Latimer streaming failed', {
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  getCapabilities(modelId: string): ProviderCapabilities {
    log.debug('Getting capabilities for Latimer model', { modelId });

    // Latimer uses custom API without native streaming/reasoning support
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

    // Basic validation before API-level validation
    if (!modelId || typeof modelId !== 'string' || modelId.trim() === '') {
      log.warn('Invalid model ID format', { modelId });
      return false;
    }

    // Support latimer-prefixed models
    if (!modelId.startsWith('latimer-')) {
      log.warn('Model ID does not match Latimer pattern', { modelId });
      return false;
    }

    return true;
  }
}
