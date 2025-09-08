/**
 * Shared types for AI streaming
 */
export interface StreamRequest {
    messages: unknown[];
    modelId: string;
    provider: string;
    userId: string;
    sessionId: string;
    conversationId: number | string;
    source: string;
    documentId?: string;
    systemPrompt?: string;
    options?: {
        reasoningEffort?: 'minimal' | 'low' | 'medium' | 'high';
        responseMode?: 'standard' | 'priority' | 'flex';
        maxTokens?: number;
        temperature?: number;
        thinkingBudget?: number;
    };
    maxTokens?: number;
    temperature?: number;
    tools?: Record<string, unknown>;
    timeout?: number;
    telemetry?: {
        recordInputs?: boolean;
        recordOutputs?: boolean;
    };
    callbacks?: StreamingCallbacks;
}
export interface StreamResponse {
    result: Record<string, unknown>;
    requestId: string;
    capabilities: ProviderCapabilities;
    telemetryConfig?: Record<string, unknown>;
}
export interface StreamConfig {
    model: unknown;
    messages: unknown[];
    system?: string;
    maxTokens?: number;
    temperature?: number;
    tools?: Record<string, unknown>;
    timeout?: number;
    providerOptions?: Record<string, unknown>;
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
    }) => Promise<void>;
    onError?: (error: Error) => void;
}
export interface StreamingProgress {
    metadata?: {
        tokens?: number;
        [key: string]: unknown;
    };
}
export interface ProviderCapabilities {
    supportsReasoning: boolean;
    supportsThinking: boolean;
    maxThinkingTokens?: number;
    supportedResponseModes: string[];
    supportsBackgroundMode: boolean;
    supportedTools: string[];
    typicalLatencyMs: number;
    maxTimeoutMs: number;
    costPerInputToken?: number;
    costPerOutputToken?: number;
}
export interface TelemetrySpan {
    addEvent(name: string, attributes: Record<string, unknown>): void;
    setAttributes(attributes: Record<string, unknown>): void;
    setStatus(status: {
        code: number;
        message?: string;
    }): void;
    recordException(error: Error): void;
    end(): void;
}
export interface TelemetryConfig {
    isEnabled: boolean;
    functionId?: string;
    metadata?: Record<string, unknown>;
    recordInputs?: boolean;
    recordOutputs?: boolean;
    tracer?: {
        startSpan(name: string, options?: Record<string, unknown>): TelemetrySpan;
    };
}
export interface SettingsConfig {
    OPENAI_API_KEY?: string;
    GOOGLE_API_KEY?: string;
    AZURE_OPENAI_KEY?: string;
    AZURE_OPENAI_ENDPOINT?: string;
    AWS_ACCESS_KEY_ID?: string;
    AWS_SECRET_ACCESS_KEY?: string;
    AWS_REGION?: string;
}
