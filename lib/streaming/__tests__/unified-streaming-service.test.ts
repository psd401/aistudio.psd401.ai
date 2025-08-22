/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { UnifiedStreamingService } from '../unified-streaming-service';
import { getTelemetryConfig } from '../telemetry-service';
import { getProviderAdapter } from '../provider-adapters';
import type { StreamRequest, ProviderCapabilities, ProviderAdapter } from '../types';

// Mock dependencies
jest.mock('../telemetry-service');
jest.mock('../provider-adapters');
jest.mock('@/lib/logger', () => ({
  createLogger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }),
  generateRequestId: () => 'test-request-id',
  startTimer: () => jest.fn()
}));

describe.skip('UnifiedStreamingService', () => {
  let streamingService: UnifiedStreamingService;
  let mockAdapter: {
    createModel: jest.Mock<any>;
    getCapabilities: jest.Mock<any>;
    getProviderOptions: jest.Mock<any>;
    streamWithEnhancements: jest.Mock<any>;
  };
  let mockTelemetryConfig: {
    isEnabled: boolean;
    functionId: string;
    metadata: Record<string, unknown>;
    recordInputs: boolean;
    recordOutputs: boolean;
    tracer: {
      startSpan: jest.Mock;
    };
  };

  beforeEach(() => {
    streamingService = new UnifiedStreamingService();
    
    mockAdapter = {
      createModel: jest.fn(),
      getCapabilities: jest.fn(),
      getProviderOptions: jest.fn(),
      streamWithEnhancements: jest.fn()
    };
    
    mockTelemetryConfig = {
      isEnabled: true,
      functionId: 'test-function',
      metadata: {} as Record<string, string | number | boolean>,
      recordInputs: true,
      recordOutputs: true,
      tracer: {
        startSpan: jest.fn(() => ({
          setAttributes: jest.fn(),
          addEvent: jest.fn(),
          recordException: jest.fn(),
          setStatus: jest.fn(),
          end: jest.fn()
        }))
      }
    };
    
    (getProviderAdapter as any).mockResolvedValue(mockAdapter as unknown as ProviderAdapter);
    (getTelemetryConfig as any).mockResolvedValue(mockTelemetryConfig);
  });

  describe('stream', () => {
    it('should successfully stream with OpenAI provider', async () => {
      // Arrange
      const request: StreamRequest = {
        provider: 'openai',
        modelId: 'gpt-4',
        messages: [
          {
            id: '1',
            role: 'user',
            parts: [{ type: 'text', text: 'Hello' }]
          }
        ],
        source: 'chat',
        userId: 'test-user'
      };

      const mockCapabilities: ProviderCapabilities = {
        supportsReasoning: false,
        supportsThinking: false,
        supportedResponseModes: ['standard'],
        supportsBackgroundMode: false,
        supportedTools: [],
        typicalLatencyMs: 1000,
        maxTimeoutMs: 30000,
        costPerInputToken: 0.00001,
        costPerOutputToken: 0.00003
      };

      const mockStreamResult = {
        toDataStreamResponse: jest.fn(),
        usage: Promise.resolve({
          totalTokens: 100,
          promptTokens: 50,
          completionTokens: 50
        })
      };

      mockAdapter.getCapabilities.mockReturnValue(mockCapabilities);
      mockAdapter.createModel.mockResolvedValue('mock-model' as any);
      mockAdapter.getProviderOptions.mockReturnValue({});
      mockAdapter.streamWithEnhancements.mockResolvedValue(mockStreamResult as any);

      // Act
      const result = await streamingService.stream(request);

      // Assert
      expect(result).toBeDefined();
      expect(result.result).toBe(mockStreamResult);
      expect(result.capabilities).toBe(mockCapabilities);
      expect(mockAdapter.streamWithEnhancements).toHaveBeenCalled();
    });

    it('should handle reasoning models with extended timeout', async () => {
      // Arrange
      const request: StreamRequest = {
        provider: 'openai',
        modelId: 'o3-mini',
        messages: [
          {
            id: '1',
            role: 'user',
            parts: [{ type: 'text', text: 'Solve this complex problem' }]
          }
        ],
        source: 'chat',
        userId: 'test-user',
        options: {
          reasoningEffort: 'high'
        }
      };

      const mockCapabilities: ProviderCapabilities = {
        supportsReasoning: true,
        supportsThinking: false,
        supportedResponseModes: ['standard', 'flex', 'priority'],
        supportsBackgroundMode: true,
        supportedTools: ['web_search', 'code_interpreter'],
        typicalLatencyMs: 10000,
        maxTimeoutMs: 600000,
        costPerInputToken: 0.00015,
        costPerOutputToken: 0.0006,
        costPerReasoningToken: 0.0003
      };

      const mockStreamResult = {
        toDataStreamResponse: jest.fn(),
        usage: Promise.resolve({
          totalTokens: 500,
          promptTokens: 100,
          completionTokens: 200,
          reasoningTokens: 200
        })
      };

      mockAdapter.getCapabilities.mockReturnValue(mockCapabilities);
      mockAdapter.createModel.mockResolvedValue('mock-model' as any);
      mockAdapter.getProviderOptions.mockReturnValue({});
      mockAdapter.streamWithEnhancements.mockResolvedValue(mockStreamResult as any);

      // Act
      const result = await streamingService.stream(request);

      // Assert
      expect(result).toBeDefined();
      expect(mockAdapter.streamWithEnhancements).toHaveBeenCalled();
    });

    it('should handle Claude thinking models', async () => {
      // Arrange
      const request: StreamRequest = {
        provider: 'amazon-bedrock',
        modelId: 'claude-4-opus',
        messages: [
          {
            id: '1',
            role: 'user',
            parts: [{ type: 'text', text: 'Think through this step by step' }]
          }
        ],
        source: 'chat',
        userId: 'test-user',
        options: {
          thinkingBudget: 4000
        }
      };

      const mockCapabilities: ProviderCapabilities = {
        supportsReasoning: false,
        supportsThinking: true,
        maxThinkingTokens: 6553,
        supportedResponseModes: ['standard'],
        supportsBackgroundMode: false,
        supportedTools: [],
        typicalLatencyMs: 3000,
        maxTimeoutMs: 120000,
        costPerInputToken: 0.000015,
        costPerOutputToken: 0.000075
      };

      const mockStreamResult = {
        toDataStreamResponse: jest.fn(),
        usage: Promise.resolve({
          totalTokens: 300,
          promptTokens: 100,
          completionTokens: 150,
          thinkingTokens: 50
        })
      };

      mockAdapter.getCapabilities.mockReturnValue(mockCapabilities);
      mockAdapter.createModel.mockResolvedValue('mock-model' as any);
      mockAdapter.getProviderOptions.mockReturnValue({
        anthropic: {
          thinkingBudget: 4000,
          enableThinking: true,
          streamThinking: true
        }
      });
      mockAdapter.streamWithEnhancements.mockResolvedValue(mockStreamResult as any);

      // Act
      const result = await streamingService.stream(request);

      // Assert
      expect(result).toBeDefined();
      expect(mockAdapter.streamWithEnhancements).toHaveBeenCalled();
    });

    it('should handle circuit breaker open state', async () => {
      // Arrange
      const request: StreamRequest = {
        provider: 'failing-provider',
        modelId: 'test-model',
        messages: [
          {
            id: '1',
            role: 'user',
            parts: [{ type: 'text', text: 'Hello' }]
          }
        ],
        source: 'chat',
        userId: 'test-user'
      };

      // Create a failing adapter to trip the circuit breaker
      const failingAdapter = {
        ...mockAdapter,
        streamWithEnhancements: jest.fn(() => Promise.reject(new Error('Provider failure')))
      };

      (getProviderAdapter as any).mockResolvedValue(failingAdapter as unknown as ProviderAdapter);

      // Trip the circuit breaker by failing multiple times
      const streamingServiceWithFailures = new UnifiedStreamingService();
      
      // First, fail enough times to open the circuit
      for (let i = 0; i < 5; i++) {
        try {
          await streamingServiceWithFailures.stream(request);
        } catch {
          // Expected to fail
        }
      }

      // Act & Assert
      await expect(streamingServiceWithFailures.stream(request)).rejects.toThrow();
    });

    it('should record telemetry correctly', async () => {
      // Arrange
      const request: StreamRequest = {
        provider: 'openai',
        modelId: 'gpt-4',
        messages: [
          {
            id: '1',
            role: 'user',
            parts: [{ type: 'text', text: 'Hello' }]
          }
        ],
        source: 'chat',
        userId: 'test-user',
        telemetry: {
          recordInputs: true,
          recordOutputs: true
        }
      };

      const mockCapabilities: ProviderCapabilities = {
        supportsReasoning: false,
        supportsThinking: false,
        supportedResponseModes: ['standard'],
        supportsBackgroundMode: false,
        supportedTools: [],
        typicalLatencyMs: 1000,
        maxTimeoutMs: 30000,
        costPerInputToken: 0.00001,
        costPerOutputToken: 0.00003
      };

      const mockStreamResult = {
        toDataStreamResponse: jest.fn(),
        usage: Promise.resolve({
          totalTokens: 100,
          promptTokens: 50,
          completionTokens: 50
        })
      };

      mockAdapter.getCapabilities.mockReturnValue(mockCapabilities);
      mockAdapter.createModel.mockResolvedValue('mock-model' as any);
      mockAdapter.getProviderOptions.mockReturnValue({});
      mockAdapter.streamWithEnhancements.mockResolvedValue(mockStreamResult as any);

      // Act
      await streamingService.stream(request);

      // Assert
      expect(getTelemetryConfig).toHaveBeenCalledWith({
        functionId: 'chat.stream',
        userId: 'test-user',
        sessionId: undefined,
        conversationId: undefined,
        modelId: 'gpt-4',
        provider: 'openai',
        source: 'chat',
        recordInputs: true,
        recordOutputs: true
      });
    });
  });
});