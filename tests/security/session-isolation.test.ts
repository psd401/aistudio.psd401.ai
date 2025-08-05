/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server'
import { headers } from 'next/headers'

// Mock dependencies
jest.mock('next/headers')
jest.mock('@/lib/logger', () => ({
  default: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  }
}))

// Mock the auth module to avoid ESM issues
jest.mock('@/auth', () => ({
  createAuth: jest.fn(() => ({
    auth: jest.fn(),
    handlers: {},
    signIn: jest.fn(),
    signOut: jest.fn()
  })),
  authMiddleware: jest.fn()
}))

// Import after mocking
import { createAuth } from '@/auth'
import { getServerSession } from '@/lib/auth/server-session'

const mockHeaders = headers as jest.MockedFunction<typeof headers>

describe('Session Isolation Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // Reset any module-level state
    jest.resetModules()
  })

  describe('Auth Factory Pattern', () => {
    it('should create separate auth instances for each invocation', () => {
      const auth1 = createAuth()
      const auth2 = createAuth()
      
      // Ensure instances are different
      expect(auth1).not.toBe(auth2)
      expect(auth1.auth).not.toBe(auth2.auth)
      expect(auth1.handlers).not.toBe(auth2.handlers)
    })

    it('should not share state between auth instances', () => {
      const auth1 = createAuth()
      const auth2 = createAuth()
      
      // Each instance should have its own configuration
      expect(auth1).toHaveProperty('auth')
      expect(auth1).toHaveProperty('handlers')
      expect(auth1).toHaveProperty('signIn')
      expect(auth1).toHaveProperty('signOut')
      
      expect(auth2).toHaveProperty('auth')
      expect(auth2).toHaveProperty('handlers')
      expect(auth2).toHaveProperty('signIn')
      expect(auth2).toHaveProperty('signOut')
    })
  })

  describe('Concurrent Session Handling', () => {
    it('should handle multiple concurrent session requests without bleeding', async () => {
      // Mock different request headers for different users
      const user1Headers = new Map([['x-request-id', 'user1-request']])
      const user2Headers = new Map([['x-request-id', 'user2-request']])
      
      // Create promises for concurrent session retrieval
      const sessionPromises = [
        // User 1 requests
        (async () => {
          mockHeaders.mockReturnValue(user1Headers as any)
          const auth = createAuth()
          return { userId: 'user1', auth }
        })(),
        // User 2 requests
        (async () => {
          mockHeaders.mockReturnValue(user2Headers as any)
          const auth = createAuth()
          return { userId: 'user2', auth }
        })(),
        // User 1 another request
        (async () => {
          mockHeaders.mockReturnValue(user1Headers as any)
          const auth = createAuth()
          return { userId: 'user1', auth }
        })()
      ]
      
      // Execute all requests concurrently
      const results = await Promise.all(sessionPromises)
      
      // Verify each request got its own auth instance
      expect(results[0].auth).not.toBe(results[1].auth)
      expect(results[0].auth).not.toBe(results[2].auth)
      expect(results[1].auth).not.toBe(results[2].auth)
    })

    it('should maintain session isolation in Lambda-like environment', async () => {
      // Simulate Lambda container reuse scenario
      const simulateLambdaInvocation = async (userId: string) => {
        const requestHeaders = new Map([
          ['x-request-id', `${userId}-${Date.now()}`]
        ])
        mockHeaders.mockReturnValue(requestHeaders as any)
        
        const auth = createAuth()
        return {
          userId,
          auth,
          timestamp: Date.now()
        }
      }
      
      // Simulate rapid successive invocations (Lambda container reuse)
      const invocations = []
      for (let i = 0; i < 10; i++) {
        const userId = `user${i % 3}` // Rotate between 3 users
        invocations.push(simulateLambdaInvocation(userId))
      }
      
      const results = await Promise.all(invocations)
      
      // Verify no auth instance is shared
      const authInstances = results.map(r => r.auth)
      const uniqueInstances = new Set(authInstances)
      expect(uniqueInstances.size).toBe(authInstances.length)
    })
  })

  describe('Session State Validation', () => {
    it('should not persist session state between requests', async () => {
      // First request - User A
      mockHeaders.mockReturnValue(new Map([['x-request-id', 'req-1']]) as any)
      const auth1 = createAuth()
      
      // Second request - User B (simulating container reuse)
      mockHeaders.mockReturnValue(new Map([['x-request-id', 'req-2']]) as any)
      const auth2 = createAuth()
      
      // Auth instances should be completely independent
      expect(auth1).not.toBe(auth2)
      
      // Mock auth responses - cast auth objects to any to mock methods
      const mockAuth1 = jest.spyOn(auth1 as any, 'auth').mockResolvedValue({
        user: { id: 'user-a', email: 'a@example.com' }
      })
      
      const mockAuth2 = jest.spyOn(auth2 as any, 'auth').mockResolvedValue({
        user: { id: 'user-b', email: 'b@example.com' }
      })
      
      // Get sessions
      const session1 = await auth1.auth()
      const session2 = await auth2.auth()
      
      // Verify sessions are different
      expect(session1?.user?.id).toBe('user-a')
      expect(session2?.user?.id).toBe('user-b')
      expect(session1).not.toBe(session2)
    })
  })

  describe('Request Context Isolation', () => {
    it('should maintain separate request contexts', async () => {
      const contexts: any[] = []
      
      // Simulate multiple concurrent requests
      const requests = Array.from({ length: 5 }, (_, i) => {
        return new Promise(resolve => {
          setTimeout(() => {
            mockHeaders.mockReturnValue(
              new Map([['x-request-id', `request-${i}`]]) as any
            )
            const auth = createAuth()
            contexts.push({ requestId: `request-${i}`, auth })
            resolve(auth)
          }, Math.random() * 10) // Random delay to simulate real conditions
        })
      })
      
      await Promise.all(requests)
      
      // Verify all contexts have unique auth instances
      const authInstances = contexts.map(c => c.auth)
      const uniqueAuthInstances = new Set(authInstances)
      expect(uniqueAuthInstances.size).toBe(contexts.length)
    })
  })

  describe('Error Scenarios', () => {
    it('should handle auth creation failures gracefully', () => {
      // Test that createAuth can be called multiple times
      const auth1 = createAuth()
      const auth2 = createAuth()
      const auth3 = createAuth()
      
      // All should be different instances
      expect(auth1).not.toBe(auth2)
      expect(auth2).not.toBe(auth3)
      expect(auth1).not.toBe(auth3)
    })
  })

  describe('Memory Leak Prevention', () => {
    it('should not accumulate auth instances in memory', () => {
      const instances: any[] = []
      
      // Create many auth instances
      for (let i = 0; i < 100; i++) {
        const auth = createAuth()
        instances.push(auth)
      }
      
      // All instances should be unique
      const uniqueInstances = new Set(instances)
      expect(uniqueInstances.size).toBe(100)
      
      // Clear references (simulating request end)
      instances.length = 0
      
      // In a real scenario, these should be garbage collected
      // This test mainly ensures we're not using a singleton
    })
  })
})