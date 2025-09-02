import { BaseProviderAdapter, type ProviderOptions, type ModelInstance, type ImageModelInstance } from './base-adapter';
import type { ProviderCapabilities } from '../types';
import type { SettingsManager } from '../utils/settings-manager';
/**
 * OpenAI provider adapter with support for:
 * - GPT-4, GPT-4 Turbo, GPT-3.5 Turbo
 * - GPT-5 with reasoning capabilities
 * - o1 models with reasoning
 * - Native tools (web search, code interpreter)
 */
export declare class OpenAIAdapter extends BaseProviderAdapter {
    providerName: string;
    private settingsManager?;
    constructor(settingsManager?: SettingsManager);
    createModel(modelId: string, options?: ProviderOptions): Promise<ModelInstance>;
    createImageModel(modelId: string, options?: ProviderOptions): Promise<ImageModelInstance>;
    getCapabilities(modelId: string): ProviderCapabilities;
    getProviderOptions(modelId: string, options?: ProviderOptions): ProviderOptions;
    supportsModel(modelId: string): boolean;
}
