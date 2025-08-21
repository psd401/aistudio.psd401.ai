/**
 * @jest-environment node
 * 
 * Integration tests for Assistant Architect context persistence
 * Tests the full flow: Execute tool → Create conversation → Ask follow-up → Verify context
 */

// Mock TextEncoder/TextDecoder for Node environment
global.TextEncoder = require('util').TextEncoder
global.TextDecoder = require('util').TextDecoder

// Mock all dependencies before imports
jest.mock('@/lib/auth/server-session', () => ({
  getServerSession: jest.fn()
}))
jest.mock('@/lib/db/data-api-adapter', () => ({
  executeSQL: jest.fn(),
  executeTransaction: jest.fn()
}))
jest.mock('@/lib/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
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
jest.mock('@/actions/db/get-current-user-action', () => ({
  getCurrentUserAction: jest.fn()
}))
jest.mock('@/lib/settings-manager', () => ({
  Settings: {
    getOpenAI: jest.fn().mockResolvedValue('test-key')
  }
}))
jest.mock('@ai-sdk/openai', () => ({
  createOpenAI: jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: jest.fn().mockResolvedValue({
          choices: [{ message: { content: 'AI response' } }]
        })
      }
    }
  }))
}))
jest.mock('ai', () => ({
  streamText: jest.fn().mockResolvedValue({
    toDataStreamResponse: jest.fn().mockReturnValue(new Response())
  }),
  convertToModelMessages: jest.fn(messages => messages),
  createOpenAI: jest.fn().mockReturnValue(() => ({}))
}))
jest.mock('@/app/api/chat/lib/provider-factory', () => ({
  createProviderModel: jest.fn().mockResolvedValue({
    chat: { completions: { create: jest.fn() } }
  })
}))
jest.mock('@/app/api/chat/lib/system-prompt-builder', () => ({
  buildSystemPrompt: jest.fn().mockReturnValue('System prompt')
}))
jest.mock('@/app/api/chat/lib/conversation-handler', () => ({
  handleConversation: jest.fn().mockResolvedValue(500),
  saveAssistantMessage: jest.fn().mockResolvedValue(true),
  getModelConfig: jest.fn().mockResolvedValue({ id: 1, model_id: 'gpt-4', provider: 'openai' }),
  getConversationContext: jest.fn().mockResolvedValue({})
}))
jest.mock('@/app/api/chat/lib/execution-context', () => ({
  loadExecutionContextData: jest.fn().mockResolvedValue({
    completeData: {
      repositoryIds: [],
      execution: {}
    }
  }),
  buildInitialPromptForStreaming: jest.fn().mockReturnValue('Context prompt')
}))
jest.mock('@/app/api/chat/lib/knowledge-context', () => ({
  getAssistantOwnerSub: jest.fn().mockResolvedValue('owner-sub')
}))

import { POST } from '@/app/api/chat/route'
import { getServerSession } from '@/lib/auth/server-session'
import { executeSQL } from '@/lib/db/data-api-adapter'
import { getCurrentUserAction } from '@/actions/db/get-current-user-action'

const mockGetServerSession = getServerSession as jest.Mock
const mockExecuteSQL = executeSQL as jest.Mock
const mockGetCurrentUserAction = getCurrentUserAction as jest.Mock

describe('Assistant Architect Context Persistence - Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    
    // Setup default mocks
    mockGetServerSession.mockResolvedValue({
      user: { sub: 'user123', email: 'test@example.com' },
      expires: '2024-12-31'
    })
    
    mockGetCurrentUserAction.mockResolvedValue({
      isSuccess: true,
      data: { user: { id: 1, email: 'test@example.com' } }
    })
  })

  describe('Full conversation flow with context', () => {
    it('should maintain context through full conversation flow', async () => {
      // Step 1: Initial execution with context
      const executionContext = {
        executionId: 123,
        toolId: 456,
        inputData: { question: 'What was the dignity score?' },
        promptResults: [
          { 
            promptId: 1, 
            input: { text: 'analyze this text' }, 
            output: 'Dignity score: 4.0', 
            status: 'completed' 
          }
        ]
      }

      // Mock for initial conversation creation
      mockExecuteSQL
        .mockResolvedValueOnce([{ id: 1, model_id: 'gpt-4', provider: 'openai' }]) // Model query
        .mockResolvedValueOnce([{ // Execution details for buildInitialPromptForStreaming
          input_data: JSON.stringify({ question: 'What was the dignity score?' }),
          status: 'completed',
          tool_name: 'Test Tool',
          tool_description: 'Test description'
        }])
        .mockResolvedValueOnce([{ // Chain prompts for buildInitialPromptForStreaming
          id: 1,
          name: 'Main Prompt',
          content: 'Answer this question: ${question}',
          system_context: 'You are a helpful assistant',
          position: 1
        }])
        .mockResolvedValueOnce([{ id: 500 }]) // New conversation ID
        .mockResolvedValueOnce([]) // Insert message

      const firstRequest = new Request('http://localhost:3000/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'What was the dignity score?' }],
          modelId: 'gpt-4',
          source: 'assistant_execution',
          executionId: 123,
          context: executionContext
        })
      })

      const firstResponse = await POST(firstRequest)
      if (firstResponse.status !== 200) {
        console.log('Still error:', firstResponse.body)
      }
      expect(firstResponse.status).toBe(200)
      expect(firstResponse.headers.get('X-Conversation-Id')).toBe('500')

      // Verify context was stored
      const insertCall = mockExecuteSQL.mock.calls.find(call =>
        call[0].includes('INSERT INTO conversations')
      )
      expect(insertCall).toBeDefined()
      const contextParam = insertCall[1].find((p: any) => p.name === 'context')
      expect(JSON.parse(contextParam.value.stringValue)).toEqual(executionContext)

      // Step 2: Follow-up conversation using stored context
      mockExecuteSQL.mockClear()
      mockExecuteSQL
        .mockResolvedValueOnce([{ id: 1, model_id: 'gpt-4', provider: 'openai' }]) // Model query
        .mockResolvedValueOnce([]) // Message history
        .mockResolvedValueOnce([{ // Conversation with context
          id: 500,
          context: JSON.stringify(executionContext),
          execution_id: 123
        }])
        .mockResolvedValueOnce([{ // Execution data
          input_data: '{"message": "analyze this text"}',
          status: 'completed',
          tool_name: 'Dignity Evaluator',
          tool_description: 'Evaluates text dignity'
        }])
        .mockResolvedValueOnce([{ // Prompt results
          prompt_id: 1,
          prompt_input: '{"text": "analyze this text"}',
          output_data: 'Dignity score: 4.0',
          prompt_status: 'completed',
          prompt_name: 'Evaluation Prompt'
        }])
        .mockResolvedValueOnce([]) // Insert message

      const followUpRequest = new Request('http://localhost:3000/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'Can you explain why it got that score?' }],
          modelId: 'gpt-4',
          conversationId: 500
        })
      })

      const followUpResponse = await POST(followUpRequest)
      expect(followUpResponse.status).toBe(200)

      // Verify context was retrieved
      const contextQuery = mockExecuteSQL.mock.calls.find(call =>
        call[0].includes('SELECT c.context, c.execution_id')
      )
      expect(contextQuery).toBeDefined()

      // Verify execution details were fetched in parallel
      const executionQuery = mockExecuteSQL.mock.calls.find(call =>
        call[0].includes('FROM tool_executions te')
      )
      const promptQuery = mockExecuteSQL.mock.calls.find(call =>
        call[0].includes('FROM prompt_results pr')
      )
      expect(executionQuery).toBeDefined()
      expect(promptQuery).toBeDefined()
    })

    it('should handle context size limits appropriately', async () => {
      // Create large context that exceeds 100KB
      const largePromptResults = Array(50).fill(null).map((_, i) => ({
        promptId: i,
        input: { data: 'x'.repeat(1000) },
        output: 'y'.repeat(1000),
        status: 'completed'
      }))

      const largeContext = {
        executionId: 999,
        toolId: 888,
        inputData: { message: 'test' },
        promptResults: largePromptResults
      }

      mockExecuteSQL
        .mockResolvedValueOnce([{ id: 1, model_id: 'gpt-4', provider: 'openai' }])
        .mockResolvedValueOnce([{ // Execution details
          input_data: JSON.stringify({ question: 'Hello' }),
          status: 'completed',
          tool_name: 'Test Tool',
          tool_description: 'Test description'
        }])
        .mockResolvedValueOnce([{ // Chain prompts
          id: 1,
          name: 'Main Prompt',
          content: 'Answer this question: ${question}',
          system_context: 'You are a helpful assistant',
          position: 1
        }])
        .mockResolvedValueOnce([{ id: 600 }])
        .mockResolvedValueOnce([])

      const request = new Request('http://localhost:3000/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'Hello' }],
          modelId: 'gpt-4',
          source: 'assistant_execution',
          executionId: 999,
          context: largeContext
        })
      })

      await POST(request)

      // Context should be stored despite size
      const insertCall = mockExecuteSQL.mock.calls.find(call =>
        call[0].includes('INSERT INTO conversations')
      )
      expect(insertCall).toBeDefined()
      const contextParam = insertCall[1].find((p: any) => p.name === 'context')
      expect(contextParam.value.stringValue).toBeDefined()
    })
  })

  describe('Streaming context injection', () => {
    it('should inject context into streaming system prompts', async () => {
      const { streamText } = require('ai')
      
      mockExecuteSQL
        .mockResolvedValueOnce([{ id: 1, model_id: 'gpt-4', provider: 'openai' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{
          id: 700,
          context: JSON.stringify({
            executionId: 777,
            promptResults: [{ output: 'Previous result' }]
          }),
          execution_id: 777
        }])
        .mockResolvedValueOnce([{
          tool_name: 'Test Tool',
          input_data: '{"test": true}'
        }])
        .mockResolvedValueOnce([{
          output_data: 'Previous result',
          prompt_name: 'Test Prompt'
        }])
        .mockResolvedValueOnce([])

      const request = new Request('http://localhost:3000/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'Tell me more' }],
          modelId: 'gpt-4',
          conversationId: 700,
          source: 'assistant_execution'
        })
      })

      await POST(request)

      // Verify streamText was called with context in system prompt
      expect(streamText).toHaveBeenCalled()
      const streamCall = streamText.mock.calls[0][0]
      expect(streamCall.messages).toBeDefined()
      
      // Check system message includes execution context
      const systemMessage = streamCall.messages.find((m: any) => m.role === 'system')
      expect(systemMessage.content).toContain('Tool: Test Tool')
      expect(systemMessage.content).toContain('Previous result')
    })
  })

  describe('Error handling and resilience', () => {
    it('should continue without context if retrieval fails', async () => {
      mockExecuteSQL
        .mockResolvedValueOnce([{ id: 1, model_id: 'gpt-4', provider: 'openai' }])
        .mockResolvedValueOnce([])
        .mockRejectedValueOnce(new Error('Database error')) // Conversation query fails
        .mockResolvedValueOnce([])

      const request = new Request('http://localhost:3000/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'Hello' }],
          modelId: 'gpt-4',
          conversationId: 800
        })
      })

      const response = await POST(request)
      
      // Should still work without context
      expect(response.status).toBe(200)
    })

    it('should handle concurrent requests to same conversation', async () => {
      const conversationId = 900
      const context = { executionId: 901, promptResults: [] }

      // Setup mocks for two concurrent requests
      mockExecuteSQL
        // First request mocks
        .mockResolvedValueOnce([{ id: 1, model_id: 'gpt-4', provider: 'openai' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: conversationId, context: JSON.stringify(context), execution_id: 901 }])
        .mockResolvedValueOnce([{ tool_name: 'Tool1' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        // Second request mocks
        .mockResolvedValueOnce([{ id: 1, model_id: 'gpt-4', provider: 'openai' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: conversationId, context: JSON.stringify(context), execution_id: 901 }])
        .mockResolvedValueOnce([{ tool_name: 'Tool1' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])

      const request1 = new Request('http://localhost:3000/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'Question 1' }],
          modelId: 'gpt-4',
          conversationId
        })
      })

      const request2 = new Request('http://localhost:3000/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'Question 2' }],
          modelId: 'gpt-4',
          conversationId
        })
      })

      // Execute requests concurrently
      const [response1, response2] = await Promise.all([
        POST(request1),
        POST(request2)
      ])

      expect(response1.status).toBe(200)
      expect(response2.status).toBe(200)
    })
  })
})