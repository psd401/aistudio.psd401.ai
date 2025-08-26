import { OpenAIAdapter } from './provider-adapters/openai-adapter';
import { ClaudeAdapter } from './provider-adapters/claude-adapter';
import { GeminiAdapter } from './provider-adapters/gemini-adapter';
import { AzureAdapter } from './provider-adapters/azure-adapter';
import type { BaseProviderAdapter } from './provider-adapters/base-adapter';
import type { SettingsManager } from './utils/settings-manager';

/**
 * Create the appropriate provider adapter based on provider name
 * @param provider - Provider name (openai, google, amazon-bedrock, azure)
 * @param settingsManager - Optional settings manager for API key retrieval
 * @returns Provider adapter instance
 */
export function createProviderAdapter(provider: string, settingsManager?: SettingsManager): BaseProviderAdapter {
  const normalizedProvider = provider.toLowerCase();
  
  switch (normalizedProvider) {
    case 'openai':
      return new OpenAIAdapter(settingsManager);
      
    case 'amazon-bedrock':
    case 'bedrock':
    case 'claude':
    case 'anthropic':
      return new ClaudeAdapter(settingsManager);
      
    case 'google':
    case 'gemini':
      return new GeminiAdapter(settingsManager);
      
    case 'azure':
    case 'azure-openai':
      return new AzureAdapter(settingsManager);
      
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

/**
 * Get all supported provider names
 */
export function getSupportedProviders(): string[] {
  return ['openai', 'amazon-bedrock', 'google', 'azure'];
}

/**
 * Check if a provider is supported
 */
export function isProviderSupported(provider: string): boolean {
  const normalizedProvider = provider.toLowerCase();
  return getSupportedProviders().some(p => 
    normalizedProvider === p || 
    normalizedProvider === p.replace('-', '') ||
    (p === 'amazon-bedrock' && ['bedrock', 'claude', 'anthropic'].includes(normalizedProvider)) ||
    (p === 'google' && normalizedProvider === 'gemini') ||
    (p === 'azure' && normalizedProvider === 'azure-openai')
  );
}