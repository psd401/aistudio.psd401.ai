import { streamText, convertToModelMessages, type UIMessage, type LanguageModel, type StreamTextResult } from 'ai';
import { createLogger, generateRequestId, startTimer } from '@/lib/logger';
import { ErrorFactories } from '@/lib/error-utils';
import { getTelemetryConfig } from './telemetry-service';
import { getProviderAdapter, type ProviderCapabilities } from './provider-adapters';
import type { StreamRequest, StreamResponse, StreamConfig } from './types';

const log = createLogger({ module: 'unified-streaming-service' });

/**
 * Unified streaming service that handles all AI streaming operations
 * across chat, compare, and assistant execution tools.
 * 
 * Features:
 * - Provider-specific optimizations (OpenAI Responses API, Claude thinking, etc.)
 * - Comprehensive telemetry and observability
 * - Circuit breaker pattern for reliability
 * - Reasoning content extraction for advanced models
 * - Adaptive timeouts based on model capabilities
 */
export class UnifiedStreamingService {
  private circuitBreakers = new Map<string, CircuitBreaker>();
  
  /**
   * Main streaming method that handles all AI operations
   */
  async stream(request: StreamRequest): Promise<StreamResponse> {
    const requestId = generateRequestId();
    const timer = startTimer('unified-streaming-service.stream');
    const log = createLogger({ requestId, module: 'unified-streaming-service' });
    
    log.info('Starting unified stream', {
      provider: request.provider,
      modelId: request.modelId,
      source: request.source,
      userId: request.userId,
      messageCount: request.messages.length
    });
    
    try {
      // 1. Get provider adapter and capabilities
      const adapter = await getProviderAdapter(request.provider);
      const capabilities = adapter.getCapabilities(request.modelId);
      
      // 2. Configure telemetry
      const telemetryConfig = await getTelemetryConfig({
        functionId: `${request.source}.stream`,
        userId: request.userId,
        sessionId: request.sessionId,
        conversationId: request.conversationId,
        modelId: request.modelId,
        provider: request.provider,
        source: request.source,
        recordInputs: request.telemetry?.recordInputs,
        recordOutputs: request.telemetry?.recordOutputs
      });
      
      // 3. Check circuit breaker
      const circuitBreaker = this.getCircuitBreaker(request.provider);
      if (!circuitBreaker.isOpen()) {
        throw ErrorFactories.providerUnavailable(request.provider);
      }
      
      // 4. Configure streaming with adaptive timeouts
      const config: StreamConfig = {
        model: await adapter.createModel(request.modelId, request.options),
        messages: convertToModelMessages(request.messages),
        system: request.systemPrompt,
        maxTokens: request.maxTokens,
        temperature: request.temperature,
        // Adaptive timeout based on model capabilities
        timeout: this.getAdaptiveTimeout(capabilities, request),
        // Provider-specific options
        providerOptions: adapter.getProviderOptions(request.modelId, request.options),
        // Telemetry configuration
        experimental_telemetry: telemetryConfig.isEnabled ? {
          isEnabled: true,
          functionId: telemetryConfig.functionId,
          metadata: telemetryConfig.metadata,
          recordInputs: telemetryConfig.recordInputs,
          recordOutputs: telemetryConfig.recordOutputs,
          tracer: telemetryConfig.tracer
        } : undefined
      };
      
      // 5. Start telemetry span
      const span = telemetryConfig.tracer?.startSpan('ai.stream.unified', {
        attributes: {
          'ai.provider': request.provider,
          'ai.model.id': request.modelId,
          'ai.source': request.source,
          'ai.reasoning.capable': capabilities.supportsReasoning,
          'ai.thinking.capable': capabilities.supportsThinking,
          'ai.request.timeout': config.timeout
        }
      });
      
      try {
        // 6. Execute streaming with provider-specific handling
        const result = await adapter.streamWithEnhancements(config, {
          onProgress: (event) => this.handleProgress(event, span, telemetryConfig),
          onReasoning: (reasoning) => this.handleReasoning(reasoning, span),
          onThinking: (thinking) => this.handleThinking(thinking, span),
          onFinish: (data) => this.handleFinish(data, span, telemetryConfig, timer),
          onError: (error) => this.handleError(error, span, circuitBreaker)
        });
        
        // 7. Mark circuit breaker as successful
        circuitBreaker.recordSuccess();
        
        log.info('Stream completed successfully', {
          provider: request.provider,
          modelId: request.modelId,
          source: request.source
        });
        
        return {
          result,
          requestId,
          capabilities,
          telemetryConfig
        };
        
      } catch (error) {
        span?.recordException(error as Error);
        span?.setStatus({ code: 2 }); // ERROR
        circuitBreaker.recordFailure();
        throw error;
      } finally {
        span?.end();
      }
      
    } catch (error) {
      timer({ status: 'error' });
      log.error('Stream failed', {
        error: error instanceof Error ? error.message : String(error),
        provider: request.provider,
        modelId: request.modelId,
        source: request.source
      });
      throw error;
    }
  }
  
  /**
   * Get or create circuit breaker for provider
   */
  private getCircuitBreaker(provider: string): CircuitBreaker {
    if (!this.circuitBreakers.has(provider)) {
      this.circuitBreakers.set(provider, new CircuitBreaker({
        failureThreshold: 5,
        recoveryTimeoutMs: 60000, // 1 minute
        monitoringPeriodMs: 60000  // 1 minute
      }));
    }
    return this.circuitBreakers.get(provider)!;
  }
  
  /**
   * Calculate adaptive timeout based on model capabilities and request
   */
  private getAdaptiveTimeout(capabilities: ProviderCapabilities, request: StreamRequest): number {
    const baseTimeout = 30000; // 30 seconds
    
    // Extend timeout for reasoning models
    if (capabilities.supportsReasoning) {
      // o3/o4 models may need up to 5 minutes for complex reasoning
      if (request.modelId.includes('o3') || request.modelId.includes('o4')) {
        return 300000; // 5 minutes
      }
      // Claude thinking models may need up to 2 minutes
      if (capabilities.supportsThinking) {
        return 120000; // 2 minutes
      }
      // Other reasoning models get 1 minute
      return 60000;
    }
    
    // Standard models use base timeout
    return request.timeout || baseTimeout;
  }
  
  /**
   * Handle streaming progress events
   */
  private handleProgress(event: any, span: any, telemetryConfig: any) {
    // Record progress metrics
    if (telemetryConfig.isEnabled && span) {
      span.addEvent('ai.stream.progress', {
        timestamp: Date.now(),
        'ai.tokens.streamed': event.tokens || 0
      });
    }
  }
  
  /**
   * Handle reasoning content for advanced models
   */
  private handleReasoning(reasoning: string, span: any) {
    if (span) {
      span.addEvent('ai.reasoning.chunk', {
        timestamp: Date.now(),
        'ai.reasoning.length': reasoning.length
      });
    }
  }
  
  /**
   * Handle thinking content for Claude models
   */
  private handleThinking(thinking: string, span: any) {
    if (span) {
      span.addEvent('ai.thinking.chunk', {
        timestamp: Date.now(),
        'ai.thinking.length': thinking.length
      });
    }
  }
  
  /**
   * Handle stream completion
   */
  private handleFinish(data: any, span: any, telemetryConfig: any, timer: any) {
    if (span) {
      span.setAttributes({
        'ai.tokens.input': data.usage?.promptTokens || 0,
        'ai.tokens.output': data.usage?.completionTokens || 0,
        'ai.tokens.total': data.usage?.totalTokens || 0,
        'ai.tokens.reasoning': data.usage?.reasoningTokens || 0,
        'ai.finish_reason': data.finishReason || 'unknown',
        'ai.cost.total': data.usage?.totalCost || 0
      });
      span.setStatus({ code: 1 }); // OK
    }
    
    timer({ 
      status: 'success',
      tokensUsed: data.usage?.totalTokens || 0,
      finishReason: data.finishReason
    });
  }
  
  /**
   * Handle stream errors
   */
  private handleError(error: Error, span: any, circuitBreaker: CircuitBreaker) {
    if (span) {
      span.recordException(error);
      span.setStatus({ code: 2 }); // ERROR
    }
    circuitBreaker.recordFailure();
  }
}

/**
 * Simple circuit breaker implementation
 */
class CircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  
  constructor(private config: {
    failureThreshold: number;
    recoveryTimeoutMs: number;
    monitoringPeriodMs: number;
  }) {}
  
  isOpen(): boolean {
    const now = Date.now();
    
    // If we're in open state, check if we should transition to half-open
    if (this.state === 'open') {
      if (now - this.lastFailureTime > this.config.recoveryTimeoutMs) {
        this.state = 'half-open';
        return true; // Allow one request through
      }
      return false; // Circuit is open, reject request
    }
    
    // Reset failure count if monitoring period has passed
    if (now - this.lastFailureTime > this.config.monitoringPeriodMs) {
      this.failures = 0;
    }
    
    return true; // Circuit is closed or half-open, allow request
  }
  
  recordSuccess(): void {
    this.failures = 0;
    this.state = 'closed';
  }
  
  recordFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();
    
    if (this.failures >= this.config.failureThreshold) {
      this.state = 'open';
    }
  }
}

// Singleton instance
export const unifiedStreamingService = new UnifiedStreamingService();