"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GeminiAdapter = void 0;
const google_1 = require("@ai-sdk/google");
const base_adapter_1 = require("./base-adapter");
/**
 * Google Gemini provider adapter with support for:
 * - Gemini 2.0 Flash
 * - Gemini 1.5 Pro and Flash
 * - Gemini 1.0 Pro
 */
class GeminiAdapter extends base_adapter_1.BaseProviderAdapter {
    providerName = 'google';
    settingsManager;
    constructor(settingsManager) {
        super();
        this.settingsManager = settingsManager;
    }
    async createModel(modelId, options) {
        console.log('Creating Google model:', modelId, { options });
        try {
            // Get Google API key from settings manager only
            if (!this.settingsManager) {
                throw new Error('Settings manager not configured');
            }
            const googleApiKey = await this.settingsManager.getSetting('GOOGLE_API_KEY');
            if (!googleApiKey) {
                throw new Error('Google API key not configured');
            }
            // Set API key for Google SDK
            process.env.GOOGLE_GENERATIVE_AI_API_KEY = googleApiKey;
            const model = (0, google_1.google)(modelId);
            console.log('Google model created successfully:', modelId);
            return model;
        }
        catch (error) {
            console.error('Failed to create Google model:', {
                modelId,
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }
    getCapabilities(modelId) {
        // Gemini 2.0 Flash
        if (this.matchesPattern(modelId, ['gemini-2.0*', 'models/gemini-2.0*'])) {
            return {
                supportsReasoning: false,
                supportsThinking: false,
                supportedResponseModes: ['standard'],
                supportsBackgroundMode: false,
                supportedTools: [],
                typicalLatencyMs: 1500,
                maxTimeoutMs: 60000, // 1 minute
                costPerInputToken: 0.00000125,
                costPerOutputToken: 0.00000375
            };
        }
        // Gemini 1.5 Pro
        if (this.matchesPattern(modelId, ['gemini-1.5-pro*', 'models/gemini-1.5-pro*'])) {
            return {
                supportsReasoning: false,
                supportsThinking: false,
                supportedResponseModes: ['standard'],
                supportsBackgroundMode: false,
                supportedTools: [],
                typicalLatencyMs: 2000,
                maxTimeoutMs: 60000, // 1 minute
                costPerInputToken: 0.00000125,
                costPerOutputToken: 0.00000375
            };
        }
        // Gemini 1.5 Flash
        if (this.matchesPattern(modelId, ['gemini-1.5-flash*', 'models/gemini-1.5-flash*'])) {
            return {
                supportsReasoning: false,
                supportsThinking: false,
                supportedResponseModes: ['standard'],
                supportsBackgroundMode: false,
                supportedTools: [],
                typicalLatencyMs: 1000,
                maxTimeoutMs: 30000, // 30 seconds
                costPerInputToken: 0.000000075,
                costPerOutputToken: 0.0000003
            };
        }
        // Gemini 1.0 Pro
        if (this.matchesPattern(modelId, ['gemini-pro*', 'gemini-1.0-pro*', 'models/gemini-pro*'])) {
            return {
                supportsReasoning: false,
                supportsThinking: false,
                supportedResponseModes: ['standard'],
                supportsBackgroundMode: false,
                supportedTools: [],
                typicalLatencyMs: 2500,
                maxTimeoutMs: 60000, // 1 minute
                costPerInputToken: 0.0000005,
                costPerOutputToken: 0.0000015
            };
        }
        // Default capabilities for unknown Gemini models
        return {
            supportsReasoning: false,
            supportsThinking: false,
            supportedResponseModes: ['standard'],
            supportsBackgroundMode: false,
            supportedTools: [],
            typicalLatencyMs: 2000,
            maxTimeoutMs: 60000
        };
    }
    getProviderOptions(modelId, options) {
        // Google models don't have special provider options currently
        return {};
    }
    supportsModel(modelId) {
        return this.matchesPattern(modelId, [
            'gemini-*',
            'models/gemini-*'
        ]);
    }
}
exports.GeminiAdapter = GeminiAdapter;
//# sourceMappingURL=gemini-adapter.js.map