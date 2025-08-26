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

// Provider Adapters
export { BaseProviderAdapter } from './provider-adapters/base-adapter';
export { OpenAIAdapter } from './provider-adapters/openai-adapter';
export { ClaudeAdapter } from './provider-adapters/claude-adapter';
export { GeminiAdapter } from './provider-adapters/gemini-adapter';
export { AzureAdapter } from './provider-adapters/azure-adapter';

// Unified Streaming Service
export { UnifiedStreamingService } from './unified-streaming-service';

// Message Utilities
export { convertAssistantUIMessages, normalizeMessage } from './utils/message-converter';

// Settings Manager
export { SettingsManager, createSettingsManager } from './utils/settings-manager';

// Types
export * from './types';

// Factory function
export { createProviderAdapter } from './provider-factory';