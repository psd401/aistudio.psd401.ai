/**
 * @jest-environment node
 */

// Mock TextEncoder/TextDecoder for Node environment
global.TextEncoder = require('util').TextEncoder
global.TextDecoder = require('util').TextDecoder

import { POST } from '@/app/api/assistant-architect/stream/route'
import { getServerSession } from '@/lib/auth/server-session'
import { executeSQL } from '@/lib/db/data-api-adapter'
import { streamCompletion } from '@/lib/ai-helpers'

// Mock dependencies
jest.mock('@/lib/auth/server-session', () => ({
  getServerSession: jest.fn()
}))
jest.mock('@/lib/db/data-api-adapter', () => ({
  executeSQL: jest.fn()
}))
jest.mock('@/lib/ai-helpers', () => ({
  streamCompletion: jest.fn()
}))
jest.mock('@/lib/logger', () => ({
  default: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn()
  }
}))
jest.mock('@/lib/rate-limit', () => ({
  rateLimit: () => () => null
}))

const mockGetServerSession = getServerSession as jest.Mock
const mockExecuteSQL = executeSQL as jest.Mock
const mockStreamCompletion = streamCompletion as jest.Mock

describe('Assistant Architect Streaming API', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should return 401 if user is not authenticated', async () => {
    mockGetServerSession.mockResolvedValue(null)

    const request = new Request('http://localhost:3000/api/assistant-architect/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        toolId: 1,
        executionId: 1,
        inputs: {}
      })
    })

    const response = await POST(request)
    
    expect(response.status).toBe(401)
    expect(await response.text()).toBe('Unauthorized')
  })

  it('should return 404 if tool is not found', async () => {
    mockGetServerSession.mockResolvedValue({
      user: { sub: 'user123', email: 'test@example.com' },
      expires: '2024-12-31'
    })

    mockExecuteSQL.mockResolvedValueOnce([]) // Empty result for tool query

    const request = new Request('http://localhost:3000/api/assistant-architect/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        toolId: 999,
        executionId: 1,
        inputs: {}
      })
    })

    const response = await POST(request)
    
    expect(response.status).toBe(404)
    expect(await response.text()).toBe('Tool not found or inactive: 999')
  })

  it('should handle streaming errors and update database', async () => {
    mockGetServerSession.mockResolvedValue({
      user: { sub: 'user123', email: 'test@example.com' },
      expires: '2024-12-31'
    })

    // Mock successful tool and prompt queries
    mockExecuteSQL
      .mockResolvedValueOnce([{ // Tool query
        id: 1,
        name: 'Test Tool',
        status: 'approved'
      }])
      .mockResolvedValueOnce([{ // Prompts query
        id: 1,
        content: 'Test prompt',
        provider: 'openai',
        model_id: 'gpt-4'
      }])
      .mockResolvedValueOnce([{ // Execution query
        id: 1,
        status: 'pending'
      }])
      .mockResolvedValueOnce([]) // Update execution status
      .mockResolvedValueOnce([{ id: 1 }]) // Insert prompt result

    // Mock streaming error
    mockStreamCompletion.mockRejectedValueOnce(new Error('AI service unavailable'))

    const request = new Request('http://localhost:3000/api/assistant-architect/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        toolId: 1,
        executionId: 1,
        inputs: {}
      })
    })

    const response = await POST(request)
    
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('text/event-stream')

    // Read the stream to verify error handling
    const reader = response.body?.getReader()
    const decoder = new TextDecoder()
    const chunks: string[] = []

    if (reader) {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(decoder.decode(value))
      }
    }

    const fullResponse = chunks.join('')
    
    // Should contain error event
    expect(fullResponse).toContain('"type":"prompt_error"')
    expect(fullResponse).toContain('AI service unavailable')
    
    // Verify database cleanup was attempted
    const updateCalls = mockExecuteSQL.mock.calls.filter(call => 
      call[0].includes('UPDATE prompt_results') && 
      call[0].includes("status = 'failed'")
    )
    expect(updateCalls.length).toBeGreaterThan(0)
  })
})