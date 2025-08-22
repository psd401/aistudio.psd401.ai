import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { POST } from '../route';
import { getServerSession } from '@/lib/auth/server-session';
import { getCurrentUserAction } from '@/actions/db/get-current-user-action';
import { unifiedStreamingService } from '@/lib/streaming/unified-streaming-service';

// Mock dependencies
jest.mock('@/lib/auth/server-session');
jest.mock('@/actions/db/get-current-user-action');
jest.mock('@/lib/streaming/unified-streaming-service');
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

const mockGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>;
const mockGetCurrentUserAction = getCurrentUserAction as jest.MockedFunction<typeof getCurrentUserAction>;
const mockUnifiedStreamingService = unifiedStreamingService as jest.Mocked<typeof unifiedStreamingService>;

describe('/api/streaming', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST', () => {
    it('should handle valid chat streaming request', async () => {
      // Arrange
      const mockSession = { sub: 'user123' };
      const mockUser = {
        isSuccess: true,
        data: {
          user: {
            id: 1,
            email: 'test@example.com'
          }
        }
      };

      const mockStreamResponse = {
        requestId: 'test-request-id',
        result: {
          toUIMessageStreamResponse: jest.fn().mockReturnValue(new Response('stream'))
        },
        capabilities: {
          supportsReasoning: false,
          supportsThinking: false,
          supportedResponseModes: ['standard'],
          supportsBackgroundMode: false,
          supportedTools: [],
          typicalLatencyMs: 1000,
          maxTimeoutMs: 30000,
          costPerInputToken: 0.00001,
          costPerOutputToken: 0.00003
        }
      };

      mockGetServerSession.mockResolvedValue(mockSession);
      mockGetCurrentUserAction.mockResolvedValue(mockUser);
      mockUnifiedStreamingService.stream.mockResolvedValue(mockStreamResponse);

      const requestBody = {
        messages: [
          {
            id: '1',
            role: 'user',
            parts: [{ type: 'text', text: 'Hello, world!' }]
          }
        ],
        modelId: 'gpt-4',
        provider: 'openai',
        source: 'chat'
      };

      const request = new Request('http://localhost:3000/api/streaming', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      // Act
      const response = await POST(request);

      // Assert
      expect(response).toBeDefined();
      expect(mockUnifiedStreamingService.stream).toHaveBeenCalledWith({
        messages: requestBody.messages,
        modelId: requestBody.modelId,
        provider: requestBody.provider,
        userId: '1',
        sessionId: 'user123',
        conversationId: undefined,
        source: 'chat',
        executionId: undefined,
        documentId: undefined,
        systemPrompt: undefined,
        maxTokens: undefined,
        temperature: undefined,
        timeout: undefined,
        options: {
          reasoningEffort: 'medium',
          responseMode: 'standard',
          backgroundMode: false,
          thinkingBudget: undefined,
          enableWebSearch: false,
          enableCodeInterpreter: false,
          enableImageGeneration: false
        },
        telemetry: {
          recordInputs: undefined,
          recordOutputs: undefined,
          customAttributes: {
            'request.id': 'test-request-id',
            'request.source': 'chat',
            'request.timestamp': expect.any(Number)
          }
        }
      });
    });

    it('should handle model comparison request', async () => {
      // Arrange
      const mockSession = { sub: 'user123' };
      const mockUser = {
        isSuccess: true,
        data: {
          user: {
            id: 1,
            email: 'test@example.com'
          }
        }
      };

      const mockStreamResponse = {
        requestId: 'test-request-id',
        result: {
          toUIMessageStreamResponse: jest.fn().mockReturnValue(new Response('stream'))
        },
        capabilities: {
          supportsReasoning: true,
          supportsThinking: false,
          supportedResponseModes: ['standard', 'flex', 'priority'],
          supportsBackgroundMode: true,
          supportedTools: ['web_search'],
          typicalLatencyMs: 3000,
          maxTimeoutMs: 300000,
          costPerInputToken: 0.00015,
          costPerOutputToken: 0.0006,
          costPerReasoningToken: 0.0003
        }
      };

      mockGetServerSession.mockResolvedValue(mockSession);
      mockGetCurrentUserAction.mockResolvedValue(mockUser);
      mockUnifiedStreamingService.stream.mockResolvedValue(mockStreamResponse);

      const requestBody = {
        messages: [
          {
            id: '1',
            role: 'user',
            parts: [{ type: 'text', text: 'Compare these options' }]
          }
        ],
        modelId: 'o3-mini',
        provider: 'openai',
        source: 'compare',
        reasoningEffort: 'high',
        responseMode: 'priority'
      };

      const request = new Request('http://localhost:3000/api/streaming', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      // Act
      const response = await POST(request);

      // Assert
      expect(response).toBeDefined();
      expect(mockUnifiedStreamingService.stream).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'compare',
          options: expect.objectContaining({
            reasoningEffort: 'high',
            responseMode: 'priority'
          })
        })
      );
    });

    it('should handle assistant execution request', async () => {
      // Arrange
      const mockSession = { sub: 'user123' };
      const mockUser = {
        isSuccess: true,
        data: {
          user: {
            id: 1,
            email: 'test@example.com'
          }
        }
      };

      const mockStreamResponse = {
        requestId: 'test-request-id',
        result: {
          toUIMessageStreamResponse: jest.fn().mockReturnValue(new Response('stream'))
        },
        capabilities: {
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
        }
      };

      mockGetServerSession.mockResolvedValue(mockSession);
      mockGetCurrentUserAction.mockResolvedValue(mockUser);
      mockUnifiedStreamingService.stream.mockResolvedValue(mockStreamResponse);

      const requestBody = {
        messages: [
          {
            id: '1',
            role: 'user',
            parts: [{ type: 'text', text: JSON.stringify({ task: 'process document' }) }]
          }
        ],
        modelId: 'claude-4-opus',
        provider: 'amazon-bedrock',
        source: 'assistant_execution',
        executionId: 12345,
        thinkingBudget: 4000
      };

      const request = new Request('http://localhost:3000/api/streaming', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      // Act
      const response = await POST(request);

      // Assert
      expect(response).toBeDefined();
      expect(mockUnifiedStreamingService.stream).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'assistant_execution',
          executionId: 12345,
          options: expect.objectContaining({
            thinkingBudget: 4000
          })
        })
      );
    });

    it('should return 401 for unauthenticated requests', async () => {
      // Arrange
      mockGetServerSession.mockResolvedValue(null);

      const request = new Request('http://localhost:3000/api/streaming', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messages: [],
          modelId: 'gpt-4',
          provider: 'openai',
          source: 'chat'
        })
      });

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(401);
    });

    it('should return 400 for invalid request body', async () => {
      // Arrange
      const mockSession = { sub: 'user123' };
      const mockUser = {
        isSuccess: true,
        data: {
          user: {
            id: 1,
            email: 'test@example.com'
          }
        }
      };

      mockGetServerSession.mockResolvedValue(mockSession);
      mockGetCurrentUserAction.mockResolvedValue(mockUser);

      const request = new Request('http://localhost:3000/api/streaming', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          // Missing required fields
          source: 'chat'
        })
      });

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(400);
      const responseBody = await response.json();
      expect(responseBody.error).toBe('Validation Error');
    });

    it('should handle streaming service errors', async () => {
      // Arrange
      const mockSession = { sub: 'user123' };
      const mockUser = {
        isSuccess: true,
        data: {
          user: {
            id: 1,
            email: 'test@example.com'
          }
        }
      };

      mockGetServerSession.mockResolvedValue(mockSession);
      mockGetCurrentUserAction.mockResolvedValue(mockUser);
      mockUnifiedStreamingService.stream.mockRejectedValue(new Error('Provider unavailable'));

      const requestBody = {
        messages: [
          {
            id: '1',
            role: 'user',
            parts: [{ type: 'text', text: 'Hello' }]
          }
        ],
        modelId: 'gpt-4',
        provider: 'openai',
        source: 'chat'
      };

      const request = new Request('http://localhost:3000/api/streaming', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(503);
      const responseBody = await response.json();
      expect(responseBody.error).toBe('Provider Unavailable');
    });
  });

  describe('OPTIONS', () => {
    it('should handle CORS preflight requests', async () => {
      // We need to import OPTIONS if it exists
      const { OPTIONS } = await import('../route');
      
      if (OPTIONS) {
        const response = await OPTIONS();
        
        expect(response.status).toBe(200);
        expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
        expect(response.headers.get('Access-Control-Allow-Methods')).toBe('POST, OPTIONS');
      }
    });
  });
});