import type { UIMessage, LanguageModel, CoreMessage } from 'ai';

/**
 * Core streaming types for the unified streaming architecture
 */

export interface StreamRequest {
  // Core request data
  messages: UIMessage[];
  modelId: string;
  provider: string;
  
  // User context
  userId: string;
  sessionId?: string;
  conversationId?: string | number;
  
  // Request source and metadata
  source: 'chat' | 'compare' | 'assistant_execution' | 'ai-helpers';
  executionId?: number;
  documentId?: string;
  
  // Model configuration
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
  timeout?: number;
  
  // Advanced model options
  options?: {
    // Reasoning configuration
    reasoningEffort?: 'minimal' | 'low' | 'medium' | 'high';
    responseMode?: 'standard' | 'flex' | 'priority';
    
    // Background processing for long-running models
    backgroundMode?: boolean;
    
    // Thinking configuration for Claude models
    thinkingBudget?: number; // 1024-6553 tokens
    
    // Tool configuration
    enableWebSearch?: boolean;
    enableCodeInterpreter?: boolean;
    enableImageGeneration?: boolean;
  };
  
  // Telemetry configuration
  telemetry?: {
    recordInputs?: boolean;
    recordOutputs?: boolean;
    customAttributes?: Record<string, string | number | boolean>;
  };
  
  // Callbacks for streaming events
  callbacks?: StreamingCallbacks;
}

export interface StreamResponse {
  result: {
    toDataStreamResponse: (options?: { headers?: Record<string, string> }) => Response;
    toUIMessageStreamResponse: (options?: { headers?: Record<string, string> }) => Response;
    usage: Promise<{
      totalTokens?: number;
      promptTokens?: number;
      completionTokens?: number;
      reasoningTokens?: number;
      totalCost?: number;
    }>;
  };
  requestId: string;
  capabilities: ProviderCapabilities;
  telemetryConfig: TelemetryConfig;
}

export interface StreamConfig {
  model: LanguageModel;
  messages: CoreMessage[];
  system?: string;
  maxTokens?: number;
  temperature?: number;
  timeout?: number;
  providerOptions?: Record<string, unknown>;
  experimental_telemetry?: {
    isEnabled: boolean;
    functionId: string;
    metadata: Record<string, string | number | boolean>;
    recordInputs: boolean;
    recordOutputs: boolean;
    tracer?: {
      startSpan: (name: string, options?: Record<string, unknown>) => TelemetrySpan;
    };
  };
}

export interface ProviderCapabilities {
  // Reasoning capabilities
  supportsReasoning: boolean;
  supportsThinking: boolean;
  maxThinkingTokens?: number;
  supportedResponseModes: ('standard' | 'flex' | 'priority')[];
  
  // Background processing
  supportsBackgroundMode: boolean;
  
  // Built-in tools
  supportedTools: string[];
  
  // Performance characteristics
  typicalLatencyMs: number;
  maxTimeoutMs: number;
  
  // Cost information
  costPerInputToken?: number;
  costPerOutputToken?: number;
  costPerReasoningToken?: number;
}

export interface TelemetrySpan {
  setAttributes: (attributes: Record<string, string | number | boolean>) => void;
  addEvent: (name: string, attributes?: Record<string, unknown>) => void;
  recordException: (error: Error) => void;
  setStatus: (status: { code: number; message?: string }) => void;
  end: () => void;
}

export interface TelemetryConfig {
  isEnabled: boolean;
  functionId: string;
  metadata: Record<string, string | number | boolean>;
  recordInputs: boolean;
  recordOutputs: boolean;
  tracer?: {
    startSpan: (name: string, options?: Record<string, unknown>) => TelemetrySpan;
  };
}

export interface StreamingProgress {
  type: 'token' | 'reasoning' | 'thinking' | 'tool_call' | 'tool_result';
  content?: string;
  text?: string; // For token events
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface StreamingCallbacks {
  onProgress?: (event: StreamingProgress) => void;
  onReasoning?: (reasoning: string) => void;
  onThinking?: (thinking: string) => void;
  onFinish?: (data: {
    text: string;
    usage?: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
      reasoningTokens?: number;
      totalCost?: number;
    };
    finishReason: string;
  }) => void;
  onError?: (error: Error) => void;
}

export interface ProviderAdapter {
  /**
   * Create a model instance for this provider
   */
  createModel(modelId: string, options?: StreamRequest['options']): Promise<LanguageModel>;
  
  /**
   * Get capabilities for a specific model
   */
  getCapabilities(modelId: string): ProviderCapabilities;
  
  /**
   * Get provider-specific options for streaming
   */
  getProviderOptions(modelId: string, options?: StreamRequest['options']): Record<string, unknown>;
  
  /**
   * Stream with provider-specific enhancements
   */
  streamWithEnhancements(
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
  }>;
  
  /**
   * Validate if this adapter supports the given model
   */
  supportsModel(modelId: string): boolean;
}

// Export unified streaming service interface
export interface IUnifiedStreamingService {
  stream(request: StreamRequest): Promise<StreamResponse>;
}

// Error types specific to streaming
export class StreamingError extends Error {
  constructor(
    message: string,
    public code: string,
    public provider?: string,
    public modelId?: string,
    public cause?: Error
  ) {
    super(message);
    this.name = 'StreamingError';
  }
}

export class ProviderUnavailableError extends StreamingError {
  constructor(provider: string, cause?: Error) {
    super(
      `Provider ${provider} is currently unavailable`,
      'PROVIDER_UNAVAILABLE',
      provider,
      undefined,
      cause
    );
  }
}

export class ModelNotSupportedError extends StreamingError {
  constructor(provider: string, modelId: string) {
    super(
      `Model ${modelId} is not supported by provider ${provider}`,
      'MODEL_NOT_SUPPORTED',
      provider,
      modelId
    );
  }
}

export class StreamTimeoutError extends StreamingError {
  constructor(timeoutMs: number, provider: string, modelId: string) {
    super(
      `Stream timed out after ${timeoutMs}ms`,
      'STREAM_TIMEOUT',
      provider,
      modelId
    );
  }
}

// Utility types for frontend hooks
export interface UseUnifiedStreamConfig {
  source: StreamRequest['source'];
  modelId?: string;
  provider?: string;
  systemPrompt?: string;
  options?: StreamRequest['options'];
  telemetry?: StreamRequest['telemetry'];
}

export interface UseUnifiedStreamReturn {
  messages: UIMessage[];
  status: 'idle' | 'loading' | 'streaming' | 'success' | 'error';
  error: Error | null;
  reasoning: string | null;
  thinking: string | null;
  sendMessage: (message: UIMessage, config?: Partial<StreamRequest>) => Promise<void>;
  stop: () => void;
  clear: () => void;
  capabilities: ProviderCapabilities | null;
}