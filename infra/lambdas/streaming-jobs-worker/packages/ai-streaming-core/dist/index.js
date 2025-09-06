"use strict";
/**
 * AI Studio Streaming Core v1.0.0
 *
 * Shared components for AI streaming across Next.js app and Lambda functions.
 *
 * Features:
 * - Multi-provider support (OpenAI, Claude via Bedrock, Google Gemini, Azure)
 * - Database-backed settings management
 * - Circuit breaker pattern for reliability
 * - Message format conversion (assistant-ui ↔ AI SDK)
 * - Bedrock v1 model compatibility
 * - IAM role authentication for Lambda deployment
 *
 * @version 1.0.0
 * @author AI Studio
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createProviderAdapter = exports.createSettingsManager = exports.SettingsManager = exports.normalizeMessage = exports.convertAssistantUIMessages = exports.UnifiedStreamingService = exports.AzureAdapter = exports.GeminiAdapter = exports.ClaudeAdapter = exports.OpenAIAdapter = exports.BaseProviderAdapter = void 0;
// Provider Adapters
var base_adapter_1 = require("./provider-adapters/base-adapter");
Object.defineProperty(exports, "BaseProviderAdapter", { enumerable: true, get: function () { return base_adapter_1.BaseProviderAdapter; } });
var openai_adapter_1 = require("./provider-adapters/openai-adapter");
Object.defineProperty(exports, "OpenAIAdapter", { enumerable: true, get: function () { return openai_adapter_1.OpenAIAdapter; } });
var claude_adapter_1 = require("./provider-adapters/claude-adapter");
Object.defineProperty(exports, "ClaudeAdapter", { enumerable: true, get: function () { return claude_adapter_1.ClaudeAdapter; } });
var gemini_adapter_1 = require("./provider-adapters/gemini-adapter");
Object.defineProperty(exports, "GeminiAdapter", { enumerable: true, get: function () { return gemini_adapter_1.GeminiAdapter; } });
var azure_adapter_1 = require("./provider-adapters/azure-adapter");
Object.defineProperty(exports, "AzureAdapter", { enumerable: true, get: function () { return azure_adapter_1.AzureAdapter; } });
// Unified Streaming Service
var unified_streaming_service_1 = require("./unified-streaming-service");
Object.defineProperty(exports, "UnifiedStreamingService", { enumerable: true, get: function () { return unified_streaming_service_1.UnifiedStreamingService; } });
// Message Utilities
var message_converter_1 = require("./utils/message-converter");
Object.defineProperty(exports, "convertAssistantUIMessages", { enumerable: true, get: function () { return message_converter_1.convertAssistantUIMessages; } });
Object.defineProperty(exports, "normalizeMessage", { enumerable: true, get: function () { return message_converter_1.normalizeMessage; } });
// Settings Manager
var settings_manager_1 = require("./utils/settings-manager");
Object.defineProperty(exports, "SettingsManager", { enumerable: true, get: function () { return settings_manager_1.SettingsManager; } });
Object.defineProperty(exports, "createSettingsManager", { enumerable: true, get: function () { return settings_manager_1.createSettingsManager; } });
// Types
__exportStar(require("./types"), exports);
// Factory function
var provider_factory_1 = require("./provider-factory");
Object.defineProperty(exports, "createProviderAdapter", { enumerable: true, get: function () { return provider_factory_1.createProviderAdapter; } });
//# sourceMappingURL=index.js.map