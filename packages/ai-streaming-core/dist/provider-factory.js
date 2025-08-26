"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createProviderAdapter = createProviderAdapter;
exports.getSupportedProviders = getSupportedProviders;
exports.isProviderSupported = isProviderSupported;
const openai_adapter_1 = require("./provider-adapters/openai-adapter");
const claude_adapter_1 = require("./provider-adapters/claude-adapter");
const gemini_adapter_1 = require("./provider-adapters/gemini-adapter");
const azure_adapter_1 = require("./provider-adapters/azure-adapter");
/**
 * Create the appropriate provider adapter based on provider name
 * @param provider - Provider name (openai, google, amazon-bedrock, azure)
 * @param settingsManager - Optional settings manager for API key retrieval
 * @returns Provider adapter instance
 */
function createProviderAdapter(provider, settingsManager) {
    const normalizedProvider = provider.toLowerCase();
    switch (normalizedProvider) {
        case 'openai':
            return new openai_adapter_1.OpenAIAdapter(settingsManager);
        case 'amazon-bedrock':
        case 'bedrock':
        case 'claude':
        case 'anthropic':
            return new claude_adapter_1.ClaudeAdapter(settingsManager);
        case 'google':
        case 'gemini':
            return new gemini_adapter_1.GeminiAdapter(settingsManager);
        case 'azure':
        case 'azure-openai':
            return new azure_adapter_1.AzureAdapter(settingsManager);
        default:
            throw new Error(`Unknown provider: ${provider}`);
    }
}
/**
 * Get all supported provider names
 */
function getSupportedProviders() {
    return ['openai', 'amazon-bedrock', 'google', 'azure'];
}
/**
 * Check if a provider is supported
 */
function isProviderSupported(provider) {
    const normalizedProvider = provider.toLowerCase();
    return getSupportedProviders().some(p => normalizedProvider === p ||
        normalizedProvider === p.replace('-', '') ||
        (p === 'amazon-bedrock' && ['bedrock', 'claude', 'anthropic'].includes(normalizedProvider)) ||
        (p === 'google' && normalizedProvider === 'gemini') ||
        (p === 'azure' && normalizedProvider === 'azure-openai'));
}
//# sourceMappingURL=provider-factory.js.map