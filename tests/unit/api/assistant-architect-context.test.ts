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
  }
}))

// Mock the getCurrentUser module
jest.mock('@/actions/db/user-actions', () => ({
  getCurrentUser: jest.fn().mockResolvedValue({
    isSuccess: true,
    data: { user: { id: 1, email: 'test@example.com' } }
  })
}))

// Mock the OpenAI stream
jest.mock('openai', () => ({
  default: jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: jest.fn()
      }
    }
  }))
}))

// Now import after mocks are set up
import { POST } from '@/app/api/chat/stream-final/route'
import { getServerSession } from '@/lib/auth/server-session'
import { executeSQL } from '@/lib/db/data-api-adapter'

const mockGetServerSession = getServerSession as jest.Mock
const mockExecuteSQL = executeSQL as jest.Mock

describe('Assistant Architect Context Persistence', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should store context when creating new conversation with executionId', async () => {
    mockGetServerSession.mockResolvedValue({
      user: { sub: 'user123', email: 'test@example.com' },
      expires: '2024-12-31'
    })


    mockExecuteSQL
      .mockResolvedValueOnce([{ id: 2, actualModelId: 'gpt-4' }]) // AI model query
      .mockResolvedValueOnce([{ id: 100 }]) // Insert conversation

    const context = {
      executionId: 5,
      toolId: 10,
      inputData: { query: 'test' },
      promptResults: [
        { promptId: 1, input: {}, output: 'result1', status: 'completed' },
        { promptId: 2, input: {}, output: 'result2', status: 'completed' }
      ]
    }

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

    await POST(request)

    // Verify conversation was created with context
    const insertCall = mockExecuteSQL.mock.calls.find(call =>
      call[0].includes('INSERT INTO conversations')
    )
    expect(insertCall).toBeDefined()
    
    // Check that context was stringified and included
    const contextParam = insertCall[1].find((p: any) => p.name === 'context')
    expect(contextParam.value.stringValue).toBe(JSON.stringify(context))
    
    // Check executionId was included
    const executionIdParam = insertCall[1].find((p: any) => p.name === 'executionId')
    expect(executionIdParam.value.longValue).toBe(5)
  })

  it('should retrieve and parse context for existing conversations', async () => {
    mockGetServerSession.mockResolvedValue({
      user: { sub: 'user123', email: 'test@example.com' },
      expires: '2024-12-31'
    })


    const storedContext = {
      executionId: 5,
      toolId: 10,
      inputData: { query: 'test' },
      promptResults: [
        { promptId: 1, input: {}, output: 'result1', status: 'completed' }
      ]
    }

    mockExecuteSQL
      .mockResolvedValueOnce([{ id: 2, actualModelId: 'gpt-4' }]) // AI model query
      .mockResolvedValueOnce([]) // Message history (empty for this test)
      .mockResolvedValueOnce([{ // Conversation data
        id: 100,
        context: JSON.stringify(storedContext),
        execution_id: 5
      }])
      .mockResolvedValueOnce([{ // Execution data
        id: 5,
        input_data: '{"query": "test"}',
        status: 'completed',
        tool_name: 'Test Tool',
        tool_description: 'A test tool'
      }])
      .mockResolvedValueOnce([{ // Prompt results
        prompt_id: 1,
        input_data: '{}',
        output_data: 'result1',
        status: 'completed',
        prompt_name: 'Test Prompt'
      }])

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

    // Verify context retrieval queries were made
    const contextQuery = mockExecuteSQL.mock.calls.find(call =>
      call[0].includes('SELECT context, execution_id FROM conversations')
    )
    expect(contextQuery).toBeDefined()
    expect(contextQuery[1][0].name).toBe('conversationId')

    // Verify execution details were fetched
    const executionQuery = mockExecuteSQL.mock.calls.find(call =>
      call[0].includes('FROM tool_executions te')
    )
    expect(executionQuery).toBeDefined()

    // Verify prompt results were fetched
    const promptResultsQuery = mockExecuteSQL.mock.calls.find(call =>
      call[0].includes('FROM prompt_results pr')
    )
    expect(promptResultsQuery).toBeDefined()
  })

  it('should handle malformed context gracefully', async () => {
    mockGetServerSession.mockResolvedValue({
      user: { sub: 'user123', email: 'test@example.com' },
      expires: '2024-12-31'
    })


    mockExecuteSQL
      .mockResolvedValueOnce([{ id: 2, actualModelId: 'gpt-4' }]) // AI model query
      .mockResolvedValueOnce([]) // Message history
      .mockResolvedValueOnce([{ // Conversation with malformed context
        id: 100,
        context: 'invalid json {{{',
        execution_id: null
      }])

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
    expect(response.headers.get('Content-Type')).toBe('text/event-stream')
  })

  it('should handle null context gracefully', async () => {
    mockGetServerSession.mockResolvedValue({
      user: { sub: 'user123', email: 'test@example.com' },
      expires: '2024-12-31'
    })


    mockExecuteSQL
      .mockResolvedValueOnce([{ id: 2, actualModelId: 'gpt-4' }]) // AI model query
      .mockResolvedValueOnce([]) // Message history
      .mockResolvedValueOnce([{ // Conversation with null context
        id: 100,
        context: null,
        execution_id: null
      }])

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
    expect(response.headers.get('Content-Type')).toBe('text/event-stream')
  })

  it('should validate and handle non-numeric executionId values', async () => {
    mockGetServerSession.mockResolvedValue({
      user: { sub: 'user123', email: 'test@example.com' },
      expires: '2024-12-31'
    })


    mockExecuteSQL
      .mockResolvedValueOnce([{ id: 2, actualModelId: 'gpt-4' }]) // AI model query
      .mockResolvedValueOnce([{ id: 100 }]) // Insert conversation

    const request = new Request('http://localhost:3000/api/chat/stream-final', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Hello' }],
        modelId: 2,
        source: 'assistant_execution',
        executionId: 'streaming', // Non-numeric value
        context: null
      })
    })

    await POST(request)

    // Verify conversation was created with null executionId
    const insertCall = mockExecuteSQL.mock.calls.find(call =>
      call[0].includes('INSERT INTO conversations')
    )
    expect(insertCall).toBeDefined()
    
    const executionIdParam = insertCall[1].find((p: any) => p.name === 'executionId')
    expect(executionIdParam.value.isNull).toBe(true)
  })
})