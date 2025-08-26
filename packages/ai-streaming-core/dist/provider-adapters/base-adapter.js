"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseProviderAdapter = void 0;
const ai_1 = require("ai");
/**
 * Base provider adapter with common functionality
 */
class BaseProviderAdapter {
    /**
     * Stream with provider-specific enhancements
     */
    async streamWithEnhancements(config, callbacks = {}) {
        console.log('Starting stream with enhancements', {
            provider: this.providerName,
            hasModel: !!config.model,
            messageCount: config.messages.length
        });
        try {
            // Start streaming with AI SDK
            const streamOptions = {
                model: config.model,
                messages: config.messages,
                ...(config.system && { system: config.system }),
                ...(config.tools && { tools: config.tools }),
                ...(config.temperature && { temperature: config.temperature }),
                ...(config.maxTokens && { maxTokens: config.maxTokens }),
                onFinish: async (finishResult) => {
                    if (callbacks.onFinish) {
                        await callbacks.onFinish({
                            text: finishResult.text,
                            usage: {
                                promptTokens: finishResult.usage?.promptTokens || 0,
                                completionTokens: finishResult.usage?.completionTokens || 0,
                                totalTokens: finishResult.usage?.totalTokens || 0,
                                ...(finishResult.experimental_providerMetadata?.openai?.reasoningTokens && {
                                    reasoningTokens: finishResult.experimental_providerMetadata.openai.reasoningTokens
                                })
                            },
                            finishReason: finishResult.finishReason
                        });
                    }
                }
            };
            // Add provider metadata if available
            if (config.providerOptions?.experimental_providerMetadata) {
                streamOptions.experimental_providerMetadata = config.providerOptions.experimental_providerMetadata;
            }
            const result = (0, ai_1.streamText)(streamOptions);
            return result;
        }
        catch (error) {
            console.error('Stream with enhancements failed:', error);
            if (callbacks.onError) {
                callbacks.onError(error);
            }
            throw error;
        }
    }
    /**
     * Check if model ID matches any of the given patterns
     */
    matchesPattern(modelId, patterns) {
        return patterns.some(pattern => {
            const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$', 'i');
            return regex.test(modelId);
        });
    }
    /**
     * Get provider-specific options for streaming
     */
    getProviderOptions(modelId, options) {
        return {};
    }
    /**
     * Check if this adapter supports the given model
     */
    supportsModel(modelId) {
        return true; // Base implementation - override in subclasses
    }
}
exports.BaseProviderAdapter = BaseProviderAdapter;
//# sourceMappingURL=base-adapter.js.map