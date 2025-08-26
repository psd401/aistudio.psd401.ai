# AI Streaming Core Package

## Overview

The `/packages/ai-streaming-core/` package provides a unified abstraction layer for AI streaming operations across multiple providers. This shared package enables consistent AI integration patterns between the main Next.js application and Lambda worker functions.

## Package Structure

```
packages/ai-streaming-core/
├── src/
│   ├── provider-adapters/       # Provider-specific adapters
│   │   ├── base-adapter.ts      # Abstract base class
│   │   ├── openai-adapter.ts    # OpenAI GPT models
│   │   ├── claude-adapter.ts    # Claude via Amazon Bedrock
│   │   ├── gemini-adapter.ts    # Google Gemini models  
│   │   └── azure-adapter.ts     # Azure OpenAI models
│   ├── utils/                   # Shared utilities
│   │   ├── settings-manager.ts  # Database-backed settings
│   │   ├── message-converter.ts # Message format conversion
│   │   └── logger.ts           # Structured logging
│   ├── types.ts                # TypeScript interfaces
│   ├── provider-factory.ts     # Provider instantiation
│   ├── unified-streaming-service.ts # Main service class
│   └── index.ts                # Package exports
├── dist/                       # Compiled JavaScript
├── package.json               # Package configuration
└── tsconfig.json             # TypeScript configuration
```

## Core Architecture

### Provider Adapter Pattern

All AI providers implement the `BaseProviderAdapter` interface, ensuring consistent behavior:

```typescript
export abstract class BaseProviderAdapter {
  abstract providerName: string;
  abstract createModel(modelId: string, options?: any): Promise<any>;
  abstract getCapabilities(modelId: string): ProviderCapabilities;
  
  async streamWithEnhancements(
    config: StreamConfig, 
    callbacks: StreamingCallbacks = {}
  ): Promise<any> {
    // Common streaming logic with AI SDK
  }
}
```

### Unified Streaming Service

The main orchestrator that coordinates all streaming operations:

```typescript
export class UnifiedStreamingService {
  async stream(request: StreamRequest): Promise<StreamResponse> {
    // 1. Get provider adapter
    const adapter = createProviderAdapter(request.provider, this.settingsManager);
    
    // 2. Check circuit breaker for reliability
    const circuitBreaker = this.getCircuitBreaker(request.provider);
    
    // 3. Convert and validate messages
    const convertedMessages = convertToModelMessages(processedMessages);
    
    // 4. Execute with provider-specific enhancements
    const result = await circuitBreaker.execute(async () => {
      return await adapter.streamWithEnhancements(config, callbacks);
    });
    
    return result;
  }
}
```

## Provider Implementations

### OpenAI Adapter

```typescript
export class OpenAIAdapter extends BaseProviderAdapter {
  providerName = 'openai';
  
  async createModel(modelId: string, options?: any): Promise<any> {
    return openai(modelId, {
      apiKey: await this.getApiKey(),
      organization: options?.organization
    });
  }
  
  getCapabilities(modelId: string): ProviderCapabilities {
    // Support for reasoning models (o1, o3, GPT-4o with reasoning)
    const supportsReasoning = this.matchesPattern(modelId, [
      'o1-*', 'o3-*', 'gpt-4o*', 'gpt-5*'
    ]);
    
    return {
      supportsReasoning,
      supportsThinking: false,
      supportedResponseModes: ['standard', 'priority'],
      supportsBackgroundMode: false,
      supportedTools: ['function_calling', 'code_interpreter'],
      typicalLatencyMs: supportsReasoning ? 15000 : 3000,
      maxTimeoutMs: supportsReasoning ? 300000 : 60000
    };
  }
}
```

### Claude Adapter (via Bedrock)

```typescript
export class ClaudeAdapter extends BaseProviderAdapter {
  providerName = 'amazon-bedrock';
  
  async createModel(modelId: string, options?: any): Promise<any> {
    // Support both Bedrock v1 and v2 model formats
    const bedrockModelId = this.normalizeBedrockModelId(modelId);
    
    return bedrock(bedrockModelId, {
      region: process.env.AWS_REGION,
      // IAM role authentication for Lambda deployment
      credentials: await this.getCredentials()
    });
  }
  
  getCapabilities(modelId: string): ProviderCapabilities {
    // Claude 3.5 Sonnet with thinking support
    const supportsThinking = modelId.includes('claude-3-5-sonnet');
    
    return {
      supportsReasoning: false,
      supportsThinking,
      maxThinkingTokens: supportsThinking ? 20000 : undefined,
      supportedResponseModes: ['standard', 'flex'],
      supportsBackgroundMode: true,
      supportedTools: ['function_calling', 'computer_use'],
      typicalLatencyMs: 5000,
      maxTimeoutMs: supportsThinking ? 120000 : 60000
    };
  }
}
```

## Settings Management System

Database-first configuration with environment variable fallback:

```typescript
export class SettingsManager {
  private cache = new Map<string, { value: any; expires: number }>();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  
  async getSetting(key: string, defaultValue?: any): Promise<any> {
    // 1. Check cache first
    const cached = this.cache.get(key);
    if (cached && cached.expires > Date.now()) {
      return cached.value;
    }
    
    // 2. Query database
    const dbValue = await this.queryDatabase(key);
    if (dbValue !== null) {
      this.cache.set(key, { value: dbValue, expires: Date.now() + this.CACHE_TTL });
      return dbValue;
    }
    
    // 3. Fallback to environment variable
    const envValue = process.env[key] || defaultValue;
    if (envValue) {
      this.cache.set(key, { value: envValue, expires: Date.now() + this.CACHE_TTL });
    }
    
    return envValue;
  }
  
  async getApiKey(provider: string): Promise<string> {
    const keyMap = {
      'openai': 'OPENAI_API_KEY',
      'google': 'GOOGLE_API_KEY', 
      'azure': 'AZURE_OPENAI_KEY',
      'amazon-bedrock': 'AWS_SECRET_ACCESS_KEY' // IAM role preferred
    };
    
    return await this.getSetting(keyMap[provider]);
  }
}
```

## Message Processing Pipeline

### Format Conversion

The package handles multiple message formats seamlessly:

```typescript
export function convertAssistantUIMessages(messages: any[]): any[] {
  return messages.map(msg => {
    // Convert assistant-ui format to AI SDK format
    if (msg.content && Array.isArray(msg.content)) {
      return {
        role: msg.role,
        content: msg.content.map(part => ({
          type: part.type,
          text: part.text,
          ...(part.image && { image: part.image })
        }))
      };
    }
    
    return msg;
  });
}
```

### Message Preprocessing

Ensures compatibility across all providers:

```typescript
private preprocessMessages(messages: any[]): any[] {
  return messages.map((msg) => {
    // Handle assistant-ui parts format
    if (msg.parts && Array.isArray(msg.parts)) {
      return msg;
    }
    
    // Convert string content to parts array
    if (typeof msg.content === 'string') {
      return {
        ...msg,
        parts: [{ type: 'text', text: msg.content }]
      };
    }
    
    // Convert content array to parts
    if (Array.isArray(msg.content)) {
      return {
        ...msg,
        parts: msg.content
      };
    }
    
    return msg;
  });
}
```

## Circuit Breaker Implementation

Provides resilience against provider failures:

```typescript
class CircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private isOpen = false;
  
  constructor(
    private readonly failureThreshold = 5,
    private readonly recoveryTimeoutMs = 60000
  ) {}
  
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.isOpen && Date.now() - this.lastFailureTime < this.recoveryTimeoutMs) {
      throw new Error('Circuit breaker is open');
    }
    
    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }
  
  private onSuccess() {
    this.failures = 0;
    this.isOpen = false;
  }
  
  private onFailure() {
    this.failures++;
    this.lastFailureTime = Date.now();
    
    if (this.failures >= this.failureThreshold) {
      this.isOpen = true;
    }
  }
}
```

## Adaptive Timeout System

Automatically adjusts timeouts based on model capabilities:

```typescript
private getAdaptiveTimeout(capabilities: ProviderCapabilities, request: StreamRequest): number {
  const baseTimeout = 30000; // 30 seconds
  
  // Complex reasoning models need extended time
  if (capabilities.supportsReasoning) {
    if (request.modelId.includes('o3') || request.modelId.includes('gpt-5')) {
      return 300000; // 5 minutes
    }
    return 60000; // 1 minute
  }
  
  // Thinking models get moderate extension
  if (capabilities.supportsThinking) {
    return 120000; // 2 minutes
  }
  
  return request.timeout || baseTimeout;
}
```

## Bedrock v1 Compatibility

Handles both old and new Bedrock model identifiers:

```typescript
private normalizeBedrockModelId(modelId: string): string {
  // Support legacy Bedrock v1 model IDs
  const legacyMappings = {
    'claude-3-sonnet': 'anthropic.claude-3-sonnet-20240229-v1:0',
    'claude-3-haiku': 'anthropic.claude-3-haiku-20240307-v1:0',
    'claude-3-opus': 'anthropic.claude-3-opus-20240229-v1:0'
  };
  
  return legacyMappings[modelId] || modelId;
}
```

## IAM Role Authentication

Optimized for Lambda deployment with proper AWS credentials:

```typescript
async getCredentials(): Promise<any> {
  // In Lambda, use IAM role credentials automatically
  if (process.env.AWS_LAMBDA_FUNCTION_NAME) {
    return undefined; // Use default credential chain
  }
  
  // For local development, use explicit credentials
  return {
    accessKeyId: await this.settingsManager?.getSetting('AWS_ACCESS_KEY_ID'),
    secretAccessKey: await this.settingsManager?.getSetting('AWS_SECRET_ACCESS_KEY'),
    region: process.env.AWS_REGION || 'us-east-1'
  };
}
```

## Package Build System

### TypeScript Configuration

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020"],
    "module": "CommonJS",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### Build Scripts

```json
{
  "scripts": {
    "build": "tsc",
    "build:watch": "tsc --watch", 
    "clean": "rm -rf dist",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src/**/*.ts"
  }
}
```

## Usage Examples

### Basic Streaming

```typescript
import { UnifiedStreamingService, createSettingsManager } from '@aistudio/streaming-core';

const settingsManager = createSettingsManager(executeSQL);
const streamingService = new UnifiedStreamingService(settingsManager);

const response = await streamingService.stream({
  messages: [{ role: 'user', content: 'Hello!' }],
  modelId: 'gpt-4o',
  provider: 'openai',
  userId: '123',
  sessionId: 'session-abc',
  conversationId: 456,
  source: 'chat',
  callbacks: {
    onProgress: (event) => console.log('Progress:', event),
    onFinish: async (data) => console.log('Finished:', data.text)
  }
});
```

### Custom Provider Adapter

```typescript
import { BaseProviderAdapter } from '@aistudio/streaming-core';

export class CustomAdapter extends BaseProviderAdapter {
  providerName = 'custom';
  
  async createModel(modelId: string, options?: any) {
    return customProvider(modelId, {
      apiKey: await this.settingsManager?.getApiKey('custom')
    });
  }
  
  getCapabilities(modelId: string): ProviderCapabilities {
    return {
      supportsReasoning: false,
      supportsThinking: false,
      supportedResponseModes: ['standard'],
      supportsBackgroundMode: false,
      supportedTools: [],
      typicalLatencyMs: 2000,
      maxTimeoutMs: 30000
    };
  }
}
```

## Testing Strategy

### Unit Tests
- Provider adapter functionality
- Message format conversion
- Circuit breaker behavior
- Settings manager caching

### Integration Tests  
- End-to-end streaming with real providers
- Database settings retrieval
- Error handling and recovery
- Timeout behavior validation

### Performance Tests
- Latency measurements across providers
- Memory usage under load
- Circuit breaker effectiveness
- Cache performance

## Deployment Considerations

### Lambda Packaging
- Keep dependencies minimal for cold start performance
- Use tree shaking to reduce bundle size
- Pre-compile TypeScript for faster initialization

### Version Management
- Semantic versioning for breaking changes
- Backward compatibility for adapter interfaces
- Migration guides for major updates

### Security
- No API keys in source code
- Secure settings retrieval patterns
- Input sanitization for logging

## Future Roadmap

### Enhanced Features
- Provider load balancing
- Request retry with exponential backoff
- Multi-model ensemble requests
- Advanced telemetry integration

### New Providers
- Anthropic direct API support
- Mistral AI integration
- Local model support (Ollama)
- Custom provider registration

### Performance Optimizations
- Connection pooling
- Response caching
- Streaming compression
- Batch request processing

This shared package provides a solid foundation for scalable, reliable AI streaming across the entire AI Studio platform.