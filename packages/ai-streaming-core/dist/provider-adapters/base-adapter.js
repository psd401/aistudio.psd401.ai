"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseProviderAdapter = void 0;
const ai_1 = require("ai");
const logger_1 = require("../utils/logger");
/**
 * Base provider adapter with common functionality
 */
class BaseProviderAdapter {
    /**
     * Stream with provider-specific enhancements
     */
    async streamWithEnhancements(config, callbacks = {}) {
        const log = (0, logger_1.createLogger)({ module: 'BaseProviderAdapter', provider: this.providerName });
        log.info('Starting stream with enhancements', {
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
                            text: finishResult.text || '',
                            usage: {
                                promptTokens: finishResult.usage?.promptTokens || 0,
                                completionTokens: finishResult.usage?.completionTokens || 0,
                                totalTokens: finishResult.usage?.totalTokens || 0,
                                ...(finishResult.experimental_providerMetadata?.openai?.reasoningTokens && {
                                    reasoningTokens: finishResult.experimental_providerMetadata.openai.reasoningTokens
                                })
                            },
                            finishReason: finishResult.finishReason || 'unknown'
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
            log.error('Stream with enhancements failed', { error });
            if (callbacks.onError) {
                callbacks.onError(error);
            }
            throw error;
        }
    }
    /**
     * Generate image using provider-specific enhancements
     */
    async generateImageWithEnhancements(config, callbacks = {}) {
        const log = (0, logger_1.createLogger)({ module: 'BaseProviderAdapter', provider: this.providerName });
        log.info('Starting image generation with enhancements', {
            hasModel: !!config.model,
            prompt: config.prompt.substring(0, 100) + (config.prompt.length > 100 ? '...' : ''),
            size: config.size,
            style: config.style
        });
        try {
            // Generate image with AI SDK
            const generateOptions = {
                model: config.model,
                prompt: config.prompt,
                ...(config.size && { size: config.size }),
                ...(config.providerOptions && { providerOptions: config.providerOptions })
            };
            const result = await (0, ai_1.experimental_generateImage)(generateOptions);
            log.info('Image generation completed', {
                hasImage: !!result.image,
                mediaType: result.image?.mediaType
            });
            return result;
        }
        catch (error) {
            log.error('Image generation failed', { error });
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
        // Base implementation - override in subclasses to use modelId and options
        const log = (0, logger_1.createLogger)({ module: 'BaseProviderAdapter' });
        log.debug('Getting provider options', { modelId, hasOptions: !!options });
        return {};
    }
    /**
     * Check if this adapter supports the given model
     */
    supportsModel(modelId) {
        // Base implementation accepts all models - override in subclasses to filter by modelId
        return !!modelId; // Return false for empty/null modelId, true otherwise
    }
}
exports.BaseProviderAdapter = BaseProviderAdapter;
//# sourceMappingURL=base-adapter.js.map