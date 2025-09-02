import { BaseProviderAdapter, type ProviderOptions, type ModelInstance, type ImageModelInstance } from './base-adapter';
import type { ProviderCapabilities } from '../types';
import type { SettingsManager } from '../utils/settings-manager';
/**
 * Google Gemini provider adapter with support for:
 * - Gemini 2.0 Flash
 * - Gemini 1.5 Pro and Flash
 * - Gemini 1.0 Pro
 */
export declare class GeminiAdapter extends BaseProviderAdapter {
    providerName: string;
    private settingsManager?;
    constructor(settingsManager?: SettingsManager);
    createModel(modelId: string, options?: ProviderOptions): Promise<ModelInstance>;
    createImageModel(modelId: string, options?: ProviderOptions): Promise<ImageModelInstance>;
    getCapabilities(modelId: string): ProviderCapabilities;
    getProviderOptions(modelId: string, options?: ProviderOptions): ProviderOptions;
    supportsModel(modelId: string): boolean;
}
