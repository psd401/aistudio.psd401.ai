import { BaseProviderAdapter } from './base-adapter';
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
    createModel(modelId: string, options?: any): Promise<any>;
    createImageModel(modelId: string, options?: any): Promise<any>;
    getCapabilities(modelId: string): ProviderCapabilities;
    getProviderOptions(modelId: string, options?: any): Record<string, any>;
    supportsModel(modelId: string): boolean;
}
