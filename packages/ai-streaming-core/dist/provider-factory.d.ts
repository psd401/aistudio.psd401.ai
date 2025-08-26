import type { BaseProviderAdapter } from './provider-adapters/base-adapter';
import type { SettingsManager } from './utils/settings-manager';
/**
 * Create the appropriate provider adapter based on provider name
 * @param provider - Provider name (openai, google, amazon-bedrock, azure)
 * @param settingsManager - Optional settings manager for API key retrieval
 * @returns Provider adapter instance
 */
export declare function createProviderAdapter(provider: string, settingsManager?: SettingsManager): BaseProviderAdapter;
/**
 * Get all supported provider names
 */
export declare function getSupportedProviders(): string[];
/**
 * Check if a provider is supported
 */
export declare function isProviderSupported(provider: string): boolean;
