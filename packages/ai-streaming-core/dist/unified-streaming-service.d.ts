import type { SettingsManager } from './utils/settings-manager';
import type { StreamRequest, StreamResponse } from './types';
/**
 * Unified streaming service that handles all AI streaming operations
 * across chat, compare, and assistant execution tools.
 *
 * Supports multiple providers (OpenAI, Claude via Bedrock, Google Gemini, Azure)
 * with circuit breaker pattern, telemetry, and settings management.
 */
export declare class UnifiedStreamingService {
    private circuitBreakers;
    private settingsManager?;
    /**
     * Initialize the unified streaming service
     * @param settingsManager - Optional settings manager for database-backed configuration
     */
    constructor(settingsManager?: SettingsManager);
    /**
     * Main streaming method that handles all AI operations
     */
    stream(request: StreamRequest): Promise<StreamResponse>;
    /**
     * Generate image using unified provider system
     */
    generateImage(request: {
        provider: string;
        modelId: string;
        prompt: string;
        size?: string;
        style?: string;
        options?: Record<string, unknown>;
        userId?: string;
        source?: string;
    }): Promise<{
        image: {
            base64: string;
            mediaType: string;
        };
        metadata: {
            provider: string;
            model: string;
            prompt: string;
            size?: string;
            style?: string;
            generatedAt: string;
        };
    }>;
    /**
     * Preprocess messages to ensure correct format for AI SDK
     */
    private preprocessMessages;
    /**
     * Get or create circuit breaker for provider
     */
    private getCircuitBreaker;
    /**
     * Calculate adaptive timeout based on model capabilities
     */
    private getAdaptiveTimeout;
    /**
     * Handle streaming progress events
     */
    private handleProgress;
    /**
     * Handle reasoning content
     */
    private handleReasoning;
    /**
     * Handle thinking content
     */
    private handleThinking;
    /**
     * Handle stream completion
     */
    private handleFinish;
    /**
     * Handle stream errors
     */
    private handleError;
    /**
     * Generate unique request ID
     */
    private generateRequestId;
}
