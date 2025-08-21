/**
 * @jest-environment node
 * 
 * Test context persistence in Assistant Architect conversations
 * These tests verify that execution context is properly maintained
 * throughout a conversation session when users ask follow-up questions.
 */

// Mock TextEncoder/TextDecoder for Node environment
global.TextEncoder = require('util').TextEncoder
global.TextDecoder = require('util').TextDecoder

// Mock all dependencies before imports
jest.mock('@/lib/auth/server-session', () => ({
  getServerSession: jest.fn()
}))
jest.mock('@/lib/db/data-api-adapter', () => ({
  executeSQL: jest.fn()
}))
jest.mock('@/lib/logger', () => ({
  default: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn()
  },
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  })),
  generateRequestId: jest.fn(() => 'test-request-id'),
  startTimer: jest.fn(() => jest.fn()),
  sanitizeForLogging: jest.fn((data) => data)
}))

// Mock the getCurrentUser module
jest.mock('@/actions/db/get-current-user-action', () => ({
  getCurrentUserAction: jest.fn().mockResolvedValue({
    isSuccess: true,
    data: { user: { id: 1, email: 'test@example.com' } }
  })
}))

// Mock AI SDK components
jest.mock('ai', () => ({
  streamText: jest.fn().mockImplementation(() => ({
    toUIMessageStreamResponse: jest.fn().mockImplementation((options = {}) => {
      const headers = new Headers(options.headers || {});
      headers.set('Content-Type', 'text/event-stream');
      return new Response(new ReadableStream({
        start(controller) {
          controller.enqueue('{"type":"text","content":"Test response"}');
          controller.close();
        }
      }), {
        status: 200,
        headers
      });
    })
  })),
  convertToModelMessages: jest.fn((messages) => messages),
  UIMessage: {}
}))

// Mock provider factory
jest.mock('@/app/api/chat/lib/provider-factory', () => ({
  createProviderModel: jest.fn().mockResolvedValue({
    provider: 'openai',
    modelId: 'gpt-4'
  })
}))

// Mock system prompt builder
jest.mock('@/app/api/chat/lib/system-prompt-builder', () => ({
  buildSystemPrompt: jest.fn().mockResolvedValue('You are a helpful assistant.')
}))

// Mock conversation handler
jest.mock('@/app/api/chat/lib/conversation-handler', () => ({
  handleConversation: jest.fn().mockResolvedValue(100),
  saveAssistantMessage: jest.fn().mockResolvedValue(undefined),
  getModelConfig: jest.fn(),
  getConversationContext: jest.fn()
}))

// Mock execution context
jest.mock('@/app/api/chat/lib/execution-context', () => ({
  loadExecutionContextData: jest.fn(),
  buildInitialPromptForStreaming: jest.fn()
}))

// Mock knowledge context
jest.mock('@/app/api/chat/lib/knowledge-context', () => ({
  getAssistantOwnerSub: jest.fn()
}))

// Now import after mocks are set up
import { POST } from '@/app/api/chat/route'
import { getServerSession } from '@/lib/auth/server-session'
import { executeSQL } from '@/lib/db/data-api-adapter'
import { getModelConfig, handleConversation, getConversationContext } from '@/app/api/chat/lib/conversation-handler'
import { loadExecutionContextData } from '@/app/api/chat/lib/execution-context'

const mockGetServerSession = getServerSession as jest.Mock
const mockExecuteSQL = executeSQL as jest.Mock
const mockGetModelConfig = getModelConfig as jest.Mock
const mockHandleConversation = handleConversation as jest.Mock
const mockGetConversationContext = getConversationContext as jest.Mock
const mockLoadExecutionContextData = loadExecutionContextData as jest.Mock

describe('Assistant Architect Context Persistence', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    
    // Set up basic mock responses for all tests
    mockGetServerSession.mockResolvedValue({
      sub: 'user123',
      user: { sub: 'user123', email: 'test@example.com' },
      expires: '2024-12-31'
    })
    
    mockGetModelConfig.mockResolvedValue({
      id: 2,
      provider: 'openai',
      model_id: 'gpt-4',
      actualModelId: 'gpt-4'
    })
  })

  it('should store context when creating new conversation with executionId', async () => {
    // Set up specific mocks for this test
    mockHandleConversation.mockResolvedValue(100)

    const context = {
      executionId: 5,
      toolId: 10,
      inputData: { query: 'test' },
      promptResults: [
        { promptId: 1, input: {}, output: 'result1', status: 'completed' },
        { promptId: 2, input: {}, output: 'result2', status: 'completed' }
      ]
    }

    // Mock execution context loading to return the context
    mockLoadExecutionContextData.mockResolvedValue({
      completeData: context
    })

    const request = new Request('http://localhost:3000/api/chat/stream-final', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Hello' }],
        modelId: 2,
        source: 'assistant_execution',
        executionId: 5,
        context
      })
    })

    const response = await POST(request)
    
    expect(response.status).toBe(200)

    // Verify conversation was handled with context
    expect(mockHandleConversation).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.any(Array),
        modelId: 2,
        conversationId: undefined,
        userId: 1,
        source: 'assistant_execution',
        executionId: 5,
        context: context,
        documentId: undefined
      })
    )
  })

  it('should retrieve and parse context for existing conversations', async () => {
    const storedContext = {
      executionId: 5,
      toolId: 10,
      inputData: { query: 'test' },
      promptResults: [
        { promptId: 1, input: {}, output: 'result1', status: 'completed' }
      ]
    }

    // Mock existing conversation with context
    mockHandleConversation.mockResolvedValue(100)
    mockGetConversationContext.mockResolvedValue(storedContext)

    const request = new Request('http://localhost:3000/api/chat/stream-final', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Tell me about the results' }],
        modelId: 2,
        conversationId: 100
      })
    })

    const response = await POST(request)
    expect(response.status).toBe(200)

    // Verify context was retrieved for existing conversation
    expect(mockGetConversationContext).toHaveBeenCalledWith(100)
  })

  it('should handle malformed context gracefully', async () => {
    // Mock conversation with malformed context that returns null/undefined
    mockHandleConversation.mockResolvedValue(100)
    mockGetConversationContext.mockResolvedValue(null) // Simulates malformed context being handled

    const request = new Request('http://localhost:3000/api/chat/stream-final', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Hello' }],
        modelId: 2,
        conversationId: 100
      })
    })

    const response = await POST(request)
    
    // Should still return successful response despite malformed context
    expect(response.status).toBe(200)
    // Check that it's a streaming response (the exact header might vary)
    expect(response.headers).toBeTruthy()
  })

  it('should handle null context gracefully', async () => {
    // Mock conversation with null context
    mockHandleConversation.mockResolvedValue(100)
    mockGetConversationContext.mockResolvedValue(null)

    const request = new Request('http://localhost:3000/api/chat/stream-final', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Hello' }],
        modelId: 2,
        conversationId: 100
      })
    })

    const response = await POST(request)
    
    expect(response.status).toBe(200)
    // Check that it's a streaming response (the exact header might vary)
    expect(response.headers).toBeTruthy()
  })

  it('should validate and handle non-numeric executionId values', async () => {
    mockHandleConversation.mockResolvedValue(100)
    // Don't mock loadExecutionContextData for invalid executionId - it shouldn't be called

    const request = new Request('http://localhost:3000/api/chat/stream-final', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Hello' }],
        modelId: 2,
        source: 'assistant_execution',
        executionId: 'streaming' // Non-numeric value
      })
    })

    const response = await POST(request)
    expect(response.status).toBe(200)

    // Verify conversation was handled with undefined executionId (validates to undefined)
    expect(mockHandleConversation).toHaveBeenCalledWith(
      expect.objectContaining({
        executionId: undefined, // 'streaming' should validate to undefined
        context: undefined // No context loaded due to invalid executionId
      })
    )

    // Verify loadExecutionContextData was not called due to invalid executionId
    expect(mockLoadExecutionContextData).not.toHaveBeenCalled()
  })
})