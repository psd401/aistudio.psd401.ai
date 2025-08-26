import { BaseProviderAdapter } from './base-adapter';
import type { ProviderCapabilities } from '../types';
import type { SettingsManager } from '../utils/settings-manager';
/**
 * Azure OpenAI provider adapter with support for:
 * - GPT-4, GPT-4 Turbo, GPT-3.5 Turbo via Azure
 * - Custom deployment names
 * - Azure-specific configurations
 */
export declare class AzureAdapter extends BaseProviderAdapter {
    providerName: string;
    private settingsManager?;
    constructor(settingsManager?: SettingsManager);
    createModel(modelId: string, options?: any): Promise<any>;
    createImageModel(modelId: string, options?: any): Promise<any>;
    getCapabilities(modelId: string): ProviderCapabilities;
    getProviderOptions(modelId: string, options?: any): Record<string, any>;
    supportsModel(modelId: string): boolean;
}
