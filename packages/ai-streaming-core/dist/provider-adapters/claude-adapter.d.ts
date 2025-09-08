import { BaseProviderAdapter, type ProviderOptions, type ModelInstance, type ImageModelInstance } from './base-adapter';
import type { ProviderCapabilities } from '../types';
import type { SettingsManager } from '../utils/settings-manager';
/**
 * Claude provider adapter (via Amazon Bedrock) with support for:
 * - Claude 4 with thinking capabilities
 * - Claude 3.5 Sonnet
 * - Claude 3 (Opus, Sonnet, Haiku)
 * - Claude 2 models
 * - Bedrock v1 model support
 */
export declare class ClaudeAdapter extends BaseProviderAdapter {
    providerName: string;
    private settingsManager?;
    constructor(settingsManager?: SettingsManager);
    createModel(modelId: string, options?: ProviderOptions): Promise<ModelInstance>;
    createImageModel(modelId: string, options?: ProviderOptions): Promise<ImageModelInstance>;
    getCapabilities(modelId: string): ProviderCapabilities;
    getProviderOptions(modelId: string, options?: ProviderOptions): ProviderOptions;
    supportsModel(modelId: string): boolean;
}
