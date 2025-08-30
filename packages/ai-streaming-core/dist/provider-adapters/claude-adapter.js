"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClaudeAdapter = void 0;
const amazon_bedrock_1 = require("@ai-sdk/amazon-bedrock");
const base_adapter_1 = require("./base-adapter");
const logger_1 = require("../utils/logger");
/**
 * Claude provider adapter (via Amazon Bedrock) with support for:
 * - Claude 4 with thinking capabilities
 * - Claude 3.5 Sonnet
 * - Claude 3 (Opus, Sonnet, Haiku)
 * - Claude 2 models
 * - Bedrock v1 model support
 */
class ClaudeAdapter extends base_adapter_1.BaseProviderAdapter {
    providerName = 'amazon-bedrock';
    settingsManager;
    constructor(settingsManager) {
        super();
        this.settingsManager = settingsManager;
    }
    async createModel(modelId, options) {
        const isLambda = !!process.env.AWS_LAMBDA_FUNCTION_NAME;
        const log = (0, logger_1.createLogger)({ module: 'ClaudeAdapter' });
        log.info('Creating Bedrock model', {
            modelId,
            isLambda,
            region: process.env.AWS_REGION || 'us-east-1',
            thinkingBudget: options?.thinkingBudget
        });
        try {
            // Get Bedrock configuration
            const config = {
                region: process.env.AWS_REGION || 'us-east-1',
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
            };
            const bedrockOptions = {
                region: config.region
            };
            // Use explicit credentials for local development only
            if (!isLambda && config.accessKeyId && config.secretAccessKey) {
                log.debug('Using explicit credentials for local development');
                bedrockOptions.accessKeyId = config.accessKeyId;
                bedrockOptions.secretAccessKey = config.secretAccessKey;
            }
            else {
                log.debug('Using default AWS credential chain (IAM role)');
            }
            const bedrock = (0, amazon_bedrock_1.createAmazonBedrock)(bedrockOptions);
            const model = bedrock(modelId);
            log.info('Bedrock model created successfully', { modelId });
            return model;
        }
        catch (error) {
            log.error('Failed to create Claude model', {
                modelId,
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }
    async createImageModel(modelId, options) {
        // Parameters required by interface but not used since image generation is not supported
        const log = (0, logger_1.createLogger)({ module: 'ClaudeAdapter' });
        log.debug('Image model creation attempted', { modelId, hasOptions: !!options });
        throw new Error(`Image generation not supported by Claude/Bedrock provider for model ${modelId}`);
    }
    getCapabilities(modelId) {
        // Claude 4 models with thinking capabilities (including v1 Bedrock models)
        if (this.matchesPattern(modelId, [
            'claude-4*',
            'anthropic.claude-4*',
            '*claude-sonnet-4*',
            'us.anthropic.claude-sonnet-4*',
            'us.anthropic.claude-opus-4*'
        ])) {
            return {
                supportsReasoning: true,
                supportsThinking: true,
                maxThinkingTokens: 6553, // Maximum thinking budget for Claude 4
                supportedResponseModes: ['standard'],
                supportsBackgroundMode: false, // Claude doesn't support background mode yet
                supportedTools: [],
                typicalLatencyMs: 3000,
                maxTimeoutMs: 120000, // 2 minutes for thinking models
                costPerInputToken: 0.000015,
                costPerOutputToken: 0.000075
            };
        }
        // Claude 3.5 Sonnet (including v1 Bedrock models)
        if (this.matchesPattern(modelId, [
            'claude-3-5*',
            'anthropic.claude-3-5*',
            'us.anthropic.claude-3-5*'
        ])) {
            return {
                supportsReasoning: false,
                supportsThinking: false,
                supportedResponseModes: ['standard'],
                supportsBackgroundMode: false,
                supportedTools: [],
                typicalLatencyMs: 2000,
                maxTimeoutMs: 60000, // 1 minute
                costPerInputToken: 0.000003,
                costPerOutputToken: 0.000015
            };
        }
        // Claude 3 models (including v1 Bedrock models)
        if (this.matchesPattern(modelId, [
            'claude-3*',
            'anthropic.claude-3*',
            'us.anthropic.claude-3*'
        ])) {
            const isOpus = this.matchesPattern(modelId, ['*opus*']);
            const isHaiku = this.matchesPattern(modelId, ['*haiku*']);
            return {
                supportsReasoning: false,
                supportsThinking: false,
                supportedResponseModes: ['standard'],
                supportsBackgroundMode: false,
                supportedTools: [],
                typicalLatencyMs: isHaiku ? 1000 : isOpus ? 3000 : 2000,
                maxTimeoutMs: 60000, // 1 minute
                costPerInputToken: isOpus ? 0.000015 : isHaiku ? 0.00000025 : 0.000003,
                costPerOutputToken: isOpus ? 0.000075 : isHaiku ? 0.00000125 : 0.000015
            };
        }
        // Claude 2 models
        if (this.matchesPattern(modelId, ['claude-2*', 'anthropic.claude-2*'])) {
            return {
                supportsReasoning: false,
                supportsThinking: false,
                supportedResponseModes: ['standard'],
                supportsBackgroundMode: false,
                supportedTools: [],
                typicalLatencyMs: 2500,
                maxTimeoutMs: 60000, // 1 minute
                costPerInputToken: 0.000008,
                costPerOutputToken: 0.000024
            };
        }
        // Default capabilities for unknown Claude models
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
        const providerOptions = {};
        // Handle thinking budget for Claude 4 models
        if (options?.thinkingBudget && this.matchesPattern(modelId, [
            'claude-4*',
            'anthropic.claude-4*',
            '*claude-sonnet-4*',
            'us.anthropic.claude-sonnet-4*'
        ])) {
            providerOptions.experimental_providerMetadata = {
                anthropic: {
                    thinkingBudget: Math.min(options.thinkingBudget, 6553)
                }
            };
        }
        return providerOptions;
    }
    supportsModel(modelId) {
        return this.matchesPattern(modelId, [
            'claude-*',
            'anthropic.claude-*',
            'us.anthropic.claude-*'
        ]);
    }
}
exports.ClaudeAdapter = ClaudeAdapter;
//# sourceMappingURL=claude-adapter.js.map