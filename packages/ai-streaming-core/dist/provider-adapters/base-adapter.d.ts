import type { ProviderCapabilities, StreamConfig, StreamingCallbacks } from '../types';
export interface ProviderOptions {
    [key: string]: unknown;
}
export interface ModelInstance {
    [key: string]: unknown;
}
export interface ImageModelInstance {
    [key: string]: unknown;
}
export interface StreamResult {
    [key: string]: unknown;
}
/**
 * Base provider adapter with common functionality
 */
export declare abstract class BaseProviderAdapter {
    abstract providerName: string;
    /**
     * Create model instance for the provider
     */
    abstract createModel(modelId: string, options?: ProviderOptions): Promise<ModelInstance>;
    /**
     * Create image model instance for the provider
     */
    abstract createImageModel(modelId: string, options?: ProviderOptions): Promise<ImageModelInstance>;
    /**
     * Get provider capabilities for a specific model
     */
    abstract getCapabilities(modelId: string): ProviderCapabilities;
    /**
     * Stream with provider-specific enhancements
     */
    streamWithEnhancements(config: StreamConfig, callbacks?: StreamingCallbacks): Promise<StreamResult>;
    /**
     * Generate image using provider-specific enhancements
     */
    generateImageWithEnhancements(config: {
        model: ImageModelInstance;
        prompt: string;
        size?: string;
        style?: string;
        providerOptions?: ProviderOptions;
    }, callbacks?: {
        onError?: (error: Error) => void;
    }): Promise<{
        image: {
            base64: string;
            mediaType: string;
        };
    }>;
    /**
     * Check if model ID matches any of the given patterns
     */
    protected matchesPattern(modelId: string, patterns: string[]): boolean;
    /**
     * Get provider-specific options for streaming
     */
    getProviderOptions(modelId: string, options?: ProviderOptions): ProviderOptions;
    /**
     * Check if this adapter supports the given model
     */
    supportsModel(modelId: string): boolean;
}
