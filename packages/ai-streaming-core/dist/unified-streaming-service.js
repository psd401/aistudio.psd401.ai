"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UnifiedStreamingService = void 0;
const ai_1 = require("ai");
const provider_factory_1 = require("./provider-factory");
/**
 * Circuit breaker for provider reliability
 */
class CircuitBreaker {
    failureThreshold;
    recoveryTimeoutMs;
    failures = 0;
    lastFailureTime = 0;
    isOpen = false;
    constructor(failureThreshold = 5, recoveryTimeoutMs = 60000) {
        this.failureThreshold = failureThreshold;
        this.recoveryTimeoutMs = recoveryTimeoutMs;
    }
    execute(fn) {
        if (this.isOpen && Date.now() - this.lastFailureTime < this.recoveryTimeoutMs) {
            throw new Error('Circuit breaker is open');
        }
        return fn()
            .then(result => {
            this.onSuccess();
            return result;
        })
            .catch(error => {
            this.onFailure();
            throw error;
        });
    }
    onSuccess() {
        this.failures = 0;
        this.isOpen = false;
    }
    onFailure() {
        this.failures++;
        this.lastFailureTime = Date.now();
        if (this.failures >= this.failureThreshold) {
            this.isOpen = true;
        }
    }
    getState() {
        return {
            failures: this.failures,
            isOpen: this.isOpen,
            lastFailureTime: this.lastFailureTime
        };
    }
}
/**
 * Unified streaming service that handles all AI streaming operations
 * across chat, compare, and assistant execution tools.
 *
 * Supports multiple providers (OpenAI, Claude via Bedrock, Google Gemini, Azure)
 * with circuit breaker pattern, telemetry, and settings management.
 */
class UnifiedStreamingService {
    circuitBreakers = new Map();
    settingsManager;
    /**
     * Initialize the unified streaming service
     * @param settingsManager - Optional settings manager for database-backed configuration
     */
    constructor(settingsManager) {
        this.settingsManager = settingsManager;
    }
    /**
     * Main streaming method that handles all AI operations
     */
    async stream(request) {
        const requestId = this.generateRequestId();
        const startTime = Date.now();
        console.log('Starting unified stream', {
            provider: request.provider,
            modelId: request.modelId,
            source: request.source,
            userId: request.userId,
            messageCount: request.messages?.length || 0,
            requestId
        });
        try {
            // 1. Get provider adapter and capabilities  
            const adapter = (0, provider_factory_1.createProviderAdapter)(request.provider, this.settingsManager);
            const capabilities = adapter.getCapabilities(request.modelId);
            // 2. Check circuit breaker
            const circuitBreaker = this.getCircuitBreaker(request.provider);
            // 3. Validate and convert messages
            if (!request.messages || !Array.isArray(request.messages)) {
                throw new Error('Messages array is required for streaming');
            }
            // Process messages to ensure correct format
            const processedMessages = this.preprocessMessages(request.messages);
            let convertedMessages;
            try {
                convertedMessages = (0, ai_1.convertToModelMessages)(processedMessages);
            }
            catch (conversionError) {
                console.error('Failed to convert messages', {
                    error: conversionError.message,
                    messages: JSON.stringify(processedMessages).substring(0, 500)
                });
                throw new Error(`Message conversion failed: ${conversionError.message}`);
            }
            // 4. Create model
            const model = await adapter.createModel(request.modelId, request.options);
            // 5. Configure streaming
            const config = {
                model,
                messages: convertedMessages,
                system: request.systemPrompt,
                maxTokens: request.maxTokens || request.options?.maxTokens,
                temperature: request.temperature || request.options?.temperature,
                tools: request.tools,
                timeout: this.getAdaptiveTimeout(capabilities, request),
                providerOptions: adapter.getProviderOptions(request.modelId, request.options)
            };
            // 6. Execute streaming with circuit breaker
            const result = await circuitBreaker.execute(async () => {
                return await adapter.streamWithEnhancements(config, {
                    onProgress: (event) => {
                        this.handleProgress(event, requestId);
                        request.callbacks?.onProgress?.(event);
                    },
                    onReasoning: (reasoning) => {
                        this.handleReasoning(reasoning, requestId);
                        request.callbacks?.onReasoning?.(reasoning);
                    },
                    onThinking: (thinking) => {
                        this.handleThinking(thinking, requestId);
                        request.callbacks?.onThinking?.(thinking);
                    },
                    onFinish: async (data) => {
                        const duration = Date.now() - startTime;
                        this.handleFinish(data, requestId, duration);
                        // Call user-provided onFinish callback
                        if (request.callbacks?.onFinish) {
                            try {
                                await request.callbacks.onFinish(data);
                            }
                            catch (error) {
                                console.error('Failed to execute onFinish callback:', {
                                    error,
                                    requestId,
                                    conversationId: request.conversationId
                                });
                                // Don't rethrow to avoid breaking the stream
                            }
                        }
                    },
                    onError: (error) => {
                        this.handleError(error, requestId);
                        request.callbacks?.onError?.(error);
                    }
                });
            });
            console.log('Stream completed successfully', {
                provider: request.provider,
                modelId: request.modelId,
                requestId,
                duration: Date.now() - startTime
            });
            return {
                result,
                requestId,
                capabilities,
                telemetryConfig: { isEnabled: false } // Basic implementation
            };
        }
        catch (error) {
            const duration = Date.now() - startTime;
            console.error('Stream failed', {
                error: error instanceof Error ? error.message : String(error),
                provider: request.provider,
                modelId: request.modelId,
                requestId,
                duration
            });
            throw error;
        }
    }
    /**
     * Preprocess messages to ensure correct format for AI SDK
     */
    preprocessMessages(messages) {
        return messages.map((msg) => {
            // If message already has parts array, use it as-is
            if (msg.parts && Array.isArray(msg.parts)) {
                return msg;
            }
            // If message has content property with string, convert to parts
            if ('content' in msg && typeof msg.content === 'string') {
                return {
                    ...msg,
                    parts: [{ type: 'text', text: msg.content }]
                };
            }
            // If message has content property with array (assistant-ui format), convert to parts
            if ('content' in msg && Array.isArray(msg.content)) {
                return {
                    ...msg,
                    parts: msg.content
                };
            }
            // Otherwise, return as-is and let convertToModelMessages handle it
            return msg;
        });
    }
    /**
     * Get or create circuit breaker for provider
     */
    getCircuitBreaker(provider) {
        if (!this.circuitBreakers.has(provider)) {
            this.circuitBreakers.set(provider, new CircuitBreaker());
        }
        return this.circuitBreakers.get(provider);
    }
    /**
     * Calculate adaptive timeout based on model capabilities
     */
    getAdaptiveTimeout(capabilities, request) {
        const baseTimeout = 30000; // 30 seconds
        // Extend timeout for reasoning models
        if (capabilities.supportsReasoning) {
            // Complex reasoning models may need up to 5 minutes
            if (request.modelId.includes('o3') || request.modelId.includes('o4') || request.modelId.includes('gpt-5')) {
                return 300000; // 5 minutes
            }
            // Claude thinking models may need up to 2 minutes
            if (capabilities.supportsThinking) {
                return 120000; // 2 minutes
            }
            // Other reasoning models get 1 minute
            return 60000;
        }
        return request.timeout || baseTimeout;
    }
    /**
     * Handle streaming progress events
     */
    handleProgress(event, requestId) {
        // Basic progress logging
        console.log('Stream progress', {
            requestId,
            tokens: event.metadata?.tokens
        });
    }
    /**
     * Handle reasoning content
     */
    handleReasoning(reasoning, requestId) {
        console.log('Reasoning chunk received', {
            requestId,
            length: reasoning.length
        });
    }
    /**
     * Handle thinking content
     */
    handleThinking(thinking, requestId) {
        console.log('Thinking chunk received', {
            requestId,
            length: thinking.length
        });
    }
    /**
     * Handle stream completion
     */
    handleFinish(data, requestId, duration) {
        console.log('Stream finished', {
            requestId,
            textLength: data.text?.length || 0,
            tokensUsed: data.usage?.totalTokens || 0,
            finishReason: data.finishReason,
            duration
        });
    }
    /**
     * Handle stream errors
     */
    handleError(error, requestId) {
        console.error('Stream error', {
            requestId,
            error: error.message,
            stack: error.stack
        });
    }
    /**
     * Generate unique request ID
     */
    generateRequestId() {
        return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    }
}
exports.UnifiedStreamingService = UnifiedStreamingService;
//# sourceMappingURL=unified-streaming-service.js.map