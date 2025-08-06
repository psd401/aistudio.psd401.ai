/**
 * Unit tests for logger utilities and sensitive data filtering
 */

import { describe, it, expect } from '@jest/globals'
import {
  sanitizeForLogging,
  generateRequestId,
  startTimer,
  createLogger,
  withLogContext,
  getLogContext
} from '@/lib/logger'

describe('Sensitive Data Filtering', () => {
  it('filters passwords in objects', () => {
    const input = {
      username: 'john',
      password: 'secret123',
      confirmPassword: 'secret123',
      data: 'normal'
    }
    
    const filtered = sanitizeForLogging(input)
    
    expect(filtered).toEqual({
      username: 'john',
      password: '[REDACTED]',
      confirmPassword: '[REDACTED]',
      data: 'normal'
    })
  })
  
  it('filters tokens and API keys', () => {
    const input = {
      apiKey: 'sk-1234567890abcdef',
      token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
      refreshToken: 'refresh_token_value',
      accessToken: 'access_token_value',
      authorization: 'Bearer token123',
      normal: 'data'
    }
    
    const filtered = sanitizeForLogging(input)
    
    expect(filtered).toEqual({
      apiKey: '[REDACTED]',
      token: '[REDACTED]',
      refreshToken: '[REDACTED]',
      accessToken: '[REDACTED]',
      authorization: '[REDACTED]',
      normal: 'data'
    })
  })
  
  it('masks email addresses correctly', () => {
    const input = {
      email: 'john.doe@example.com',
      userEmail: 'jane@company.org',
      contact: 'support@test.io',
      text: 'Contact us at info@example.com for support'
    }
    
    const filtered = sanitizeForLogging(input)
    
    expect(filtered).toEqual({
      email: '***@example.com',
      userEmail: '***@company.org',
      contact: '***@test.io',
      text: 'Contact us at ***@example.com for support'
    })
  })
  
  it('handles nested objects', () => {
    const input = {
      user: {
        name: 'John',
        credentials: {
          password: 'secret',
          apiKey: 'key123'
        }
      },
      data: 'normal'
    }
    
    const filtered = sanitizeForLogging(input)
    
    expect(filtered).toEqual({
      user: {
        name: 'John',
        credentials: {
          password: '[REDACTED]',
          apiKey: '[REDACTED]'
        }
      },
      data: 'normal'
    })
  })
  
  it('handles arrays with sensitive data', () => {
    const input = {
      users: [
        { name: 'John', password: 'pass1' },
        { name: 'Jane', password: 'pass2' }
      ],
      tokens: ['token1', 'token2']
    }
    
    const filtered = sanitizeForLogging(input)
    
    expect(filtered).toEqual({
      users: [
        { name: 'John', password: '[REDACTED]' },
        { name: 'Jane', password: '[REDACTED]' }
      ],
      tokens: ['token1', 'token2'] // Array values not filtered unless in sensitive fields
    })
  })
  
  it('preserves non-sensitive data', () => {
    const input = {
      id: 123,
      name: 'Test User',
      active: true,
      metadata: { key: 'value' },
      items: [1, 2, 3]
    }
    
    const filtered = sanitizeForLogging(input)
    
    expect(filtered).toEqual(input)
  })
  
  it('handles null and undefined values', () => {
    const input = {
      password: null,
      token: undefined,
      data: 'normal'
    }
    
    const filtered = sanitizeForLogging(input)
    
    expect(filtered).toEqual(input)
  })
})

describe('Request ID Generation', () => {
  it('generates unique request IDs', () => {
    const id1 = generateRequestId()
    const id2 = generateRequestId()
    
    expect(id1).toBeTruthy()
    expect(id2).toBeTruthy()
    expect(id1).not.toBe(id2)
    expect(id1).toHaveLength(10)
  })
  
  it('generates IDs with expected format', () => {
    const id = generateRequestId()
    
    // Should be alphanumeric with hyphens/underscores
    expect(id).toMatch(/^[A-Za-z0-9_-]+$/)
  })
})

describe('Performance Timer', () => {
  it('creates timer function', () => {
    const timer = startTimer('testOperation')
    
    expect(timer).toBeInstanceOf(Function)
  })
  
  it('timer accepts metadata', () => {
    const timer = startTimer('testOperation')
    
    // Should not throw
    expect(() => {
      timer({ status: 'success', count: 5 })
    }).not.toThrow()
  })
})

describe('Logger Context', () => {
  it('creates logger with context', () => {
    const log = createLogger({
      requestId: 'test-123',
      action: 'testAction',
      userId: 'user-456'
    })
    
    expect(log).toBeDefined()
    expect(log.info).toBeInstanceOf(Function)
    expect(log.warn).toBeInstanceOf(Function)
    expect(log.error).toBeInstanceOf(Function)
    expect(log.debug).toBeInstanceOf(Function)
  })
  
  it('propagates context through async operations', async () => {
    const testContext = {
      requestId: 'async-test-123',
      userId: 'user-789'
    }
    
    await withLogContext(testContext, async () => {
      const context = getLogContext()
      expect(context).toEqual(testContext)
      
      // Nested async operation
      await Promise.resolve().then(() => {
        const nestedContext = getLogContext()
        expect(nestedContext).toEqual(testContext)
      })
    })
    
    // Context should be cleared after
    const afterContext = getLogContext()
    expect(afterContext).toEqual({})
  })
  
  it('handles concurrent contexts correctly', async () => {
    const context1 = { requestId: 'req-1', userId: 'user-1' }
    const context2 = { requestId: 'req-2', userId: 'user-2' }
    
    const results = await Promise.all([
      withLogContext(context1, async () => {
        await new Promise(resolve => setTimeout(resolve, 10))
        return getLogContext()
      }),
      withLogContext(context2, async () => {
        await new Promise(resolve => setTimeout(resolve, 5))
        return getLogContext()
      })
    ])
    
    expect(results[0]).toEqual(context1)
    expect(results[1]).toEqual(context2)
  })
})

describe('Email Masking', () => {
  it('masks various email formats', () => {
    const emails = [
      'simple@example.com',
      'user.name@example.com',
      'user+tag@example.com',
      'user_name@sub.example.com',
      'a@b.co'
    ]
    
    emails.forEach(email => {
      const result = sanitizeForLogging({ email }) as any
      expect(result.email).toMatch(/^\*\*\*@/)
      expect(result.email).toContain('@')
      expect(result.email.split('@')[1]).toBe(email.split('@')[1])
    })
  })
  
  it('masks emails in text strings', () => {
    const input = {
      message: 'Send feedback to support@example.com or admin@test.org'
    }
    
    const filtered = sanitizeForLogging(input) as any
    
    expect(filtered.message).toBe('Send feedback to ***@example.com or ***@test.org')
  })
})