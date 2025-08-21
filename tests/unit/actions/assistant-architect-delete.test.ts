import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals'
import { deleteAssistantArchitectAction } from '@/actions/db/assistant-architect-actions'
import { getServerSession } from '@/lib/auth/server-session'
import { getCurrentUserAction } from '@/actions/db/get-current-user-action'
import { hasToolAccess } from '@/utils/roles'

// Mock dependencies
jest.mock('@/lib/auth/server-session')
jest.mock('@/actions/db/get-current-user-action')
jest.mock('@/utils/roles')
jest.mock('@/lib/db/data-api-adapter', () => ({
  executeSQL: jest.fn(),
  deleteAssistantArchitect: jest.fn()
}))

// Import after mocking
const { executeSQL } = require('@/lib/db/data-api-adapter')
jest.mock('@/lib/logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }),
  generateRequestId: () => 'test-request-id',
  startTimer: () => jest.fn()
}))

describe('deleteAssistantArchitectAction - Ownership Validation', () => {
  const mockedGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>
  const mockedGetCurrentUserAction = getCurrentUserAction as jest.MockedFunction<typeof getCurrentUserAction>
  const mockedHasToolAccess = hasToolAccess as jest.MockedFunction<typeof hasToolAccess>
  const mockedExecuteSQL = executeSQL as jest.MockedFunction<any>

  beforeEach(() => {
    jest.clearAllMocks()
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('Owner Deletion', () => {
    it('should allow owner to delete their own draft assistant', async () => {
      // Setup mocks
      mockedGetServerSession.mockResolvedValue({
        sub: 'user-123',
        email: 'owner@test.com',
        givenName: 'Test',
        familyName: 'User'
      })

      mockedExecuteSQL.mockResolvedValue([{ user_id: 1, status: 'draft' }])

      mockedGetCurrentUserAction.mockResolvedValue({
        isSuccess: true,
        message: 'Success',
        data: {
          user: { id: 1, email: 'owner@test.com', cognitoSub: 'user-123' } as any,
          roles: []
        }
      })

      mockedHasToolAccess.mockResolvedValue(false) // Not an admin (neither user-management nor role-management)

      // Mock deleteAssistantArchitect to succeed
      const { deleteAssistantArchitect } = require('@/lib/db/data-api-adapter')
      deleteAssistantArchitect.mockResolvedValue(true)

      // Execute
      const result = await deleteAssistantArchitectAction('1')

      // Assert
      expect(result.isSuccess).toBe(true)
      expect(result.message).toBe('Assistant architect deleted successfully')
    })

    it('should allow owner to delete their own rejected assistant', async () => {
      // Setup mocks
      mockedGetServerSession.mockResolvedValue({
        sub: 'user-123',
        email: 'owner@test.com',
        givenName: 'Test',
        familyName: 'User'
      })

      mockedExecuteSQL.mockResolvedValue([{ user_id: 1, status: 'rejected' }])

      mockedGetCurrentUserAction.mockResolvedValue({
        isSuccess: true,
        message: 'Success',
        data: {
          user: { id: 1, email: 'owner@test.com', cognitoSub: 'user-123' } as any,
          roles: []
        }
      })

      mockedHasToolAccess.mockResolvedValue(false) // Not an admin (neither user-management nor role-management)

      // Execute
      const result = await deleteAssistantArchitectAction('1')

      // Assert
      expect(result.isSuccess).toBe(true)
      expect(result.message).toBe('Assistant architect deleted successfully')
    })

    it('should prevent owner from deleting their own approved assistant', async () => {
      // Setup mocks
      mockedGetServerSession.mockResolvedValue({
        sub: 'user-123',
        email: 'owner@test.com',
        givenName: 'Test',
        familyName: 'User'
      })

      mockedExecuteSQL.mockResolvedValue([{ user_id: 1, status: 'approved' }])

      mockedGetCurrentUserAction.mockResolvedValue({
        isSuccess: true,
        message: 'Success',
        data: {
          user: { id: 1, email: 'owner@test.com', cognitoSub: 'user-123' } as any,
          roles: []
        }
      })

      // Execute
      const result = await deleteAssistantArchitectAction('1')

      // Assert
      expect(result.isSuccess).toBe(false)
      expect(result.message).toBe('Only draft or rejected assistants can be deleted')
    })
  })

  describe('Cross-User Protection', () => {
    it('should prevent non-owner non-admin from deleting another user\'s assistant', async () => {
      // Setup mocks
      mockedGetServerSession.mockResolvedValue({
        sub: 'user-456',
        email: 'other@test.com',
        givenName: 'Other',
        familyName: 'User'
      })

      mockedExecuteSQL.mockResolvedValue([{ user_id: 1, status: 'draft' }]) // Owner is user ID 1

      mockedGetCurrentUserAction.mockResolvedValue({
        isSuccess: true,
        message: 'Success',
        data: {
          user: { id: 2, email: 'other@test.com', cognitoSub: 'user-456' } as any, // Different user ID
          roles: []
        }
      })

      mockedHasToolAccess.mockResolvedValue(false) // Not an admin (neither user-management nor role-management)

      // Execute
      const result = await deleteAssistantArchitectAction('1')

      // Assert
      expect(result.isSuccess).toBe(false)
      expect(result.message).toBe('You can only delete your own assistants')
    })
  })

  describe('Admin Override', () => {
    it('should allow admin to delete any draft assistant', async () => {
      // Setup mocks
      mockedGetServerSession.mockResolvedValue({
        sub: 'admin-789',
        email: 'admin@test.com',
        givenName: 'Admin',
        familyName: 'User'
      })

      mockedExecuteSQL.mockResolvedValue([{ user_id: 1, status: 'draft' }]) // Different owner

      mockedGetCurrentUserAction.mockResolvedValue({
        isSuccess: true,
        message: 'Success',
        data: {
          user: { id: 3, email: 'admin@test.com', cognitoSub: 'admin-789' } as any, // Admin user
          roles: [{ id: 1, name: 'admin' }]
        }
      })

      // Mock both user-management and role-management checks for admin
      mockedHasToolAccess.mockImplementation((async (sub: string, tool: string) => {
        return tool === 'user-management' || tool === 'role-management'
      }) as any)

      // Mock deleteAssistantArchitect to succeed
      const { deleteAssistantArchitect } = require('@/lib/db/data-api-adapter')
      deleteAssistantArchitect.mockResolvedValue(true)

      // Execute
      const result = await deleteAssistantArchitectAction('1')

      // Assert
      expect(result.isSuccess).toBe(true)
      expect(result.message).toBe('Assistant architect deleted successfully')
    })

    it('should prevent admin from deleting approved assistant', async () => {
      // Setup mocks
      mockedGetServerSession.mockResolvedValue({
        sub: 'admin-789',
        email: 'admin@test.com',
        givenName: 'Admin',
        familyName: 'User'
      })

      mockedExecuteSQL.mockResolvedValue([{ user_id: 1, status: 'approved' }])

      mockedGetCurrentUserAction.mockResolvedValue({
        isSuccess: true,
        message: 'Success',
        data: {
          user: { id: 3, email: 'admin@test.com', cognitoSub: 'admin-789' } as any,
          roles: [{ id: 1, name: 'admin' }]
        }
      })

      // Mock both user-management and role-management checks for admin
      mockedHasToolAccess.mockImplementation((async (sub: string, tool: string) => {
        return tool === 'user-management' || tool === 'role-management'
      }) as any)

      // Execute
      const result = await deleteAssistantArchitectAction('1')

      // Assert
      expect(result.isSuccess).toBe(false)
      expect(result.message).toBe('Only draft or rejected assistants can be deleted')
    })
  })

  describe('Edge Cases', () => {
    it('should handle missing session gracefully', async () => {
      mockedGetServerSession.mockResolvedValue(null)

      const result = await deleteAssistantArchitectAction('1')

      expect(result.isSuccess).toBe(false)
      expect(result.message).toBe('Please sign in to delete assistants')
    })

    it('should handle invalid assistant ID', async () => {
      mockedGetServerSession.mockResolvedValue({
        sub: 'user-123',
        email: 'user@test.com',
        givenName: 'Test',
        familyName: 'User'
      })

      const result = await deleteAssistantArchitectAction('invalid-id')

      expect(result.isSuccess).toBe(false)
      expect(result.message).toBe('Invalid assistant ID')
    })

    it('should handle assistant not found', async () => {
      mockedGetServerSession.mockResolvedValue({
        sub: 'user-123',
        email: 'user@test.com',
        givenName: 'Test',
        familyName: 'User'
      })

      mockedExecuteSQL.mockResolvedValue([]) // No assistant found

      const result = await deleteAssistantArchitectAction('999')

      expect(result.isSuccess).toBe(false)
      expect(result.message).toBe('Assistant not found')
    })
  })
})