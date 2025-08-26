import type { ProviderCapabilities, StreamConfig, StreamingCallbacks } from '../types';
/**
 * Base provider adapter with common functionality
 */
export declare abstract class BaseProviderAdapter {
    abstract providerName: string;
    /**
     * Create model instance for the provider
     */
    abstract createModel(modelId: string, options?: any): Promise<any>;
    /**
     * Create image model instance for the provider
     */
    abstract createImageModel(modelId: string, options?: any): Promise<any>;
    /**
     * Get provider capabilities for a specific model
     */
    abstract getCapabilities(modelId: string): ProviderCapabilities;
    /**
     * Stream with provider-specific enhancements
     */
    streamWithEnhancements(config: StreamConfig, callbacks?: StreamingCallbacks): Promise<any>;
    /**
     * Generate image using provider-specific enhancements
     */
    generateImageWithEnhancements(config: {
        model: any;
        prompt: string;
        size?: string;
        style?: string;
        providerOptions?: Record<string, any>;
    }, callbacks?: {
        onError?: (error: Error) => void;
    }): Promise<any>;
    /**
     * Check if model ID matches any of the given patterns
     */
    protected matchesPattern(modelId: string, patterns: string[]): boolean;
    /**
     * Get provider-specific options for streaming
     */
    getProviderOptions(modelId: string, options?: any): Record<string, any>;
    /**
     * Check if this adapter supports the given model
     */
    supportsModel(modelId: string): boolean;
}
