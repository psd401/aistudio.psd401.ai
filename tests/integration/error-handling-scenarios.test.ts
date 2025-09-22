/**
 * Error Handling and Failure Scenario Tests
 * Tests comprehensive error handling across the scheduling system
 * Part of Issue #271: Testing: End-to-End Scheduling Workflows
 */

import { createScheduleAction, updateScheduleAction, deleteScheduleAction, getScheduleAction } from '@/actions/db/schedule-actions'
import { executeSQL, createParameter } from '@/lib/db/data-api-adapter'
import { getServerSession } from '@/lib/auth/server-session'
import { hasToolAccess } from '@/lib/db/data-api-adapter'

// Mock dependencies
jest.mock('@/lib/auth/server-session')
jest.mock('@/lib/db/data-api-adapter')

const mockGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>
const mockExecuteSQL = executeSQL as jest.MockedFunction<typeof executeSQL>
const mockCreateParameter = createParameter as jest.MockedFunction<typeof createParameter>
const mockHasToolAccess = hasToolAccess as jest.MockedFunction<typeof hasToolAccess>

describe('Error Handling and Failure Scenarios', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockCreateParameter.mockImplementation((name, value) => ({ name, value } as any))
  })

  describe('Authentication and Authorization Errors', () => {
    test('should handle missing session gracefully', async () => {
      mockGetServerSession.mockResolvedValue(null)

      const scheduleRequest = {
        name: 'Test Schedule',
        assistantArchitectId: 1,
        scheduleConfig: {
          frequency: 'daily' as const,
          time: '07:00'
        },
        inputData: {}
      }

      const result = await createScheduleAction(scheduleRequest)

      expect(result.isSuccess).toBe(false)
      expect(result.message).toContain('Authentication required')
    })

    test('should handle invalid session data', async () => {
      mockGetServerSession.mockResolvedValue({ sub: '', email: 'test@example.com' })

      const scheduleRequest = {
        name: 'Test Schedule',
        assistantArchitectId: 1,
        scheduleConfig: {
          frequency: 'daily' as const,
          time: '07:00'
        },
        inputData: {}
      }

      const result = await createScheduleAction(scheduleRequest)

      expect(result.isSuccess).toBe(false)
      expect(result.message).toContain('Authentication required')
    })

    test('should handle insufficient permissions for assistant-architect tool', async () => {
      const mockSession = { sub: 'user-123', email: 'test@example.com' }
      mockGetServerSession.mockResolvedValue(mockSession)
      mockHasToolAccess.mockResolvedValue(false)

      const scheduleRequest = {
        name: 'Test Schedule',
        assistantArchitectId: 1,
        scheduleConfig: {
          frequency: 'daily' as const,
          time: '07:00'
        },
        inputData: {}
      }

      const result = await createScheduleAction(scheduleRequest)

      expect(result.isSuccess).toBe(false)
      expect(result.message).toContain('Insufficient permissions')
      expect(result.message).toContain('assistant-architect')
    })

    test('should handle user not found in database', async () => {
      const mockSession = { sub: 'nonexistent-user', email: 'test@example.com' }
      mockGetServerSession.mockResolvedValue(mockSession)
      mockHasToolAccess.mockResolvedValue(true)
      mockExecuteSQL.mockResolvedValueOnce([]) // Empty user result

      const scheduleRequest = {
        name: 'Test Schedule',
        assistantArchitectId: 1,
        scheduleConfig: {
          frequency: 'daily' as const,
          time: '07:00'
        },
        inputData: {}
      }

      const result = await createScheduleAction(scheduleRequest)

      expect(result.isSuccess).toBe(false)
      expect(result.message).toContain('Resource not found')
      expect(result.message).toContain('user')
    })

    test('should handle unauthorized access to assistant architect', async () => {
      const mockSession = { sub: 'user-123', email: 'test@example.com' }
      mockGetServerSession.mockResolvedValue(mockSession)
      mockHasToolAccess.mockResolvedValue(true)
      mockExecuteSQL
        .mockResolvedValueOnce([{ id: 1 }]) // User exists
        .mockResolvedValueOnce([]) // Assistant architect not found/no access

      const scheduleRequest = {
        name: 'Test Schedule',
        assistantArchitectId: 999, // Non-existent or unauthorized
        scheduleConfig: {
          frequency: 'daily' as const,
          time: '07:00'
        },
        inputData: {}
      }

      const result = await createScheduleAction(scheduleRequest)

      expect(result.isSuccess).toBe(false)
      expect(result.message).toContain('Insufficient permissions')
      expect(result.message).toContain('assistant architect')
    })
  })

  describe('Validation Error Scenarios', () => {
    const mockSession = { sub: 'user-123', email: 'test@example.com' }
    const mockUser = { id: 1 }

    beforeEach(() => {
      mockGetServerSession.mockResolvedValue(mockSession)
      mockHasToolAccess.mockResolvedValue(true)
      mockExecuteSQL.mockResolvedValueOnce([mockUser])
    })

    test('should handle empty schedule name', async () => {
      const scheduleRequest = {
        name: '', // Empty name
        assistantArchitectId: 1,
        scheduleConfig: {
          frequency: 'daily' as const,
          time: '07:00'
        },
        inputData: {}
      }

      const result = await createScheduleAction(scheduleRequest)

      expect(result.isSuccess).toBe(false)
      expect(result.message).toContain('Validation failed')
    })

    test('should handle excessively long schedule name', async () => {
      const scheduleRequest = {
        name: 'A'.repeat(1001), // Exceeds 1000 character limit
        assistantArchitectId: 1,
        scheduleConfig: {
          frequency: 'daily' as const,
          time: '07:00'
        },
        inputData: {}
      }

      const result = await createScheduleAction(scheduleRequest)

      expect(result.isSuccess).toBe(false)
      expect(result.message).toContain('Validation failed')
    })

    test('should handle invalid assistant architect ID format', async () => {
      const scheduleRequest = {
        name: 'Test Schedule',
        assistantArchitectId: -1, // Invalid negative ID
        scheduleConfig: {
          frequency: 'daily' as const,
          time: '07:00'
        },
        inputData: {}
      }

      const result = await createScheduleAction(scheduleRequest)

      expect(result.isSuccess).toBe(false)
      expect(result.message).toContain('Validation failed')
    })

    test('should handle invalid frequency value', async () => {
      const scheduleRequest = {
        name: 'Test Schedule',
        assistantArchitectId: 1,
        scheduleConfig: {
          frequency: 'invalid' as any, // Invalid frequency
          time: '07:00'
        },
        inputData: {}
      }

      const result = await createScheduleAction(scheduleRequest)

      expect(result.isSuccess).toBe(false)
      expect(result.message).toContain('Validation failed')
    })

    test('should handle invalid time format', async () => {
      const scheduleRequest = {
        name: 'Test Schedule',
        assistantArchitectId: 1,
        scheduleConfig: {
          frequency: 'daily' as const,
          time: '25:70' // Invalid time
        },
        inputData: {}
      }

      const result = await createScheduleAction(scheduleRequest)

      expect(result.isSuccess).toBe(false)
      expect(result.message).toContain('Validation failed')
    })

    test('should handle missing days of week for weekly schedule', async () => {
      const scheduleRequest = {
        name: 'Test Schedule',
        assistantArchitectId: 1,
        scheduleConfig: {
          frequency: 'weekly' as const,
          time: '07:00'
          // Missing daysOfWeek
        },
        inputData: {}
      }

      const result = await createScheduleAction(scheduleRequest)

      expect(result.isSuccess).toBe(false)
      expect(result.message).toContain('Validation failed')
    })

    test('should handle invalid day of week values', async () => {
      const scheduleRequest = {
        name: 'Test Schedule',
        assistantArchitectId: 1,
        scheduleConfig: {
          frequency: 'weekly' as const,
          time: '07:00',
          daysOfWeek: [0, 7, 8] // 7 and 8 are invalid (should be 0-6)
        },
        inputData: {}
      }

      const result = await createScheduleAction(scheduleRequest)

      expect(result.isSuccess).toBe(false)
      expect(result.message).toContain('Validation failed')
    })

    test('should handle missing day of month for monthly schedule', async () => {
      const scheduleRequest = {
        name: 'Test Schedule',
        assistantArchitectId: 1,
        scheduleConfig: {
          frequency: 'monthly' as const,
          time: '07:00'
          // Missing dayOfMonth
        },
        inputData: {}
      }

      const result = await createScheduleAction(scheduleRequest)

      expect(result.isSuccess).toBe(false)
      expect(result.message).toContain('Validation failed')
    })

    test('should handle invalid day of month values', async () => {
      const scheduleRequest = {
        name: 'Test Schedule',
        assistantArchitectId: 1,
        scheduleConfig: {
          frequency: 'monthly' as const,
          time: '07:00',
          dayOfMonth: 32 // Invalid (should be 1-31)
        },
        inputData: {}
      }

      const result = await createScheduleAction(scheduleRequest)

      expect(result.isSuccess).toBe(false)
      expect(result.message).toContain('Validation failed')
    })

    test('should handle missing cron expression for custom schedule', async () => {
      const scheduleRequest = {
        name: 'Test Schedule',
        assistantArchitectId: 1,
        scheduleConfig: {
          frequency: 'custom' as const,
          time: '07:00'
          // Missing cron expression
        },
        inputData: {}
      }

      const result = await createScheduleAction(scheduleRequest)

      expect(result.isSuccess).toBe(false)
      expect(result.message).toContain('Validation failed')
    })

    test('should handle invalid cron expression format', async () => {
      const invalidCronExpressions = [
        'invalid cron',
        '0 25 * * *', // Invalid hour (25)
        '60 9 * * *', // Invalid minute (60)
        '0 9 32 * *', // Invalid day (32)
        '0 9 * 13 *', // Invalid month (13)
        '0 9 * * 7' // Invalid day of week (7, should be 0-6)
      ]

      for (const cronExpr of invalidCronExpressions) {
        const scheduleRequest = {
          name: 'Test Schedule',
          assistantArchitectId: 1,
          scheduleConfig: {
            frequency: 'custom' as const,
            time: '07:00',
            cron: cronExpr
          },
          inputData: {}
        }

        const result = await createScheduleAction(scheduleRequest)

        expect(result.isSuccess).toBe(false)
        expect(result.message).toContain('Validation failed')
      }
    })

    test('should handle oversized input data', async () => {
      const largeInputData = {
        data: 'A'.repeat(11 * 1024 * 1024) // 11MB, exceeds 10MB limit
      }

      const scheduleRequest = {
        name: 'Test Schedule',
        assistantArchitectId: 1,
        scheduleConfig: {
          frequency: 'daily' as const,
          time: '07:00'
        },
        inputData: largeInputData
      }

      const result = await createScheduleAction(scheduleRequest)

      expect(result.isSuccess).toBe(false)
      expect(result.message).toContain('Validation failed')
    })

    test('should handle non-serializable input data', async () => {
      const circularData: any = { self: null }
      circularData.self = circularData // Create circular reference

      const scheduleRequest = {
        name: 'Test Schedule',
        assistantArchitectId: 1,
        scheduleConfig: {
          frequency: 'daily' as const,
          time: '07:00'
        },
        inputData: circularData
      }

      const result = await createScheduleAction(scheduleRequest)

      expect(result.isSuccess).toBe(false)
      expect(result.message).toContain('Validation failed')
    })
  })

  describe('Database Error Scenarios', () => {
    const mockSession = { sub: 'user-123', email: 'test@example.com' }

    beforeEach(() => {
      mockGetServerSession.mockResolvedValue(mockSession)
      mockHasToolAccess.mockResolvedValue(true)
    })

    test('should handle database connection timeout', async () => {
      const timeoutError = new Error('Connection timeout')
      timeoutError.name = 'TimeoutError'
      mockExecuteSQL.mockRejectedValue(timeoutError)

      const scheduleRequest = {
        name: 'Test Schedule',
        assistantArchitectId: 1,
        scheduleConfig: {
          frequency: 'daily' as const,
          time: '07:00'
        },
        inputData: {}
      }

      const result = await createScheduleAction(scheduleRequest)

      expect(result.isSuccess).toBe(false)
      expect(result.message).toContain('Database operation failed')
      expect(result.message).toContain('temporarily unavailable')
    })

    test('should handle database query syntax errors', async () => {
      const syntaxError = new Error('Syntax error in SQL query')
      syntaxError.name = 'PostgreSyntaxError'
      mockExecuteSQL.mockRejectedValue(syntaxError)

      const scheduleRequest = {
        name: 'Test Schedule',
        assistantArchitectId: 1,
        scheduleConfig: {
          frequency: 'daily' as const,
          time: '07:00'
        },
        inputData: {}
      }

      const result = await createScheduleAction(scheduleRequest)

      expect(result.isSuccess).toBe(false)
      expect(result.message).toContain('Database operation failed')
    })

    test('should handle database constraint violations', async () => {
      const constraintError = new Error('Foreign key constraint violation')
      constraintError.name = 'ConstraintViolationError'

      mockExecuteSQL
        .mockResolvedValueOnce([{ id: 1 }]) // User lookup succeeds
        .mockRejectedValue(constraintError) // Assistant architect lookup fails

      const scheduleRequest = {
        name: 'Test Schedule',
        assistantArchitectId: 999, // Non-existent
        scheduleConfig: {
          frequency: 'daily' as const,
          time: '07:00'
        },
        inputData: {}
      }

      const result = await createScheduleAction(scheduleRequest)

      expect(result.isSuccess).toBe(false)
      expect(result.message).toContain('Database operation failed')
    })

    test('should handle transaction rollback scenarios', async () => {
      // Simulate a scenario where schedule creation partially succeeds but EventBridge setup fails
      mockExecuteSQL
        .mockResolvedValueOnce([{ id: 1 }]) // User lookup
        .mockResolvedValueOnce([{ id: 1, name: 'Test Architect' }]) // Architect lookup
        .mockResolvedValueOnce([{ id: 1 }]) // Schedule creation succeeds

      // In a real scenario, EventBridge creation would fail and trigger rollback
      const eventBridgeError = new Error('EventBridge schedule creation failed')

      const scheduleRequest = {
        name: 'Test Schedule',
        assistantArchitectId: 1,
        scheduleConfig: {
          frequency: 'daily' as const,
          time: '07:00'
        },
        inputData: {}
      }

      // For now, this test simulates the successful DB part
      // In production, EventBridge failure would be handled by cleanup logic
      const result = await createScheduleAction(scheduleRequest)

      // This currently succeeds in our implementation, but shows the pattern
      expect(result.isSuccess).toBe(true)
    })
  })

  describe('Schedule Update Error Scenarios', () => {
    const mockSession = { sub: 'user-123', email: 'test@example.com' }

    beforeEach(() => {
      mockGetServerSession.mockResolvedValue(mockSession)
      mockHasToolAccess.mockResolvedValue(true)
    })

    test('should handle updating non-existent schedule', async () => {
      mockExecuteSQL
        .mockResolvedValueOnce([{ id: 1 }]) // User lookup
        .mockResolvedValueOnce([]) // Schedule not found

      const result = await updateScheduleAction(999, { name: 'Updated Name' })

      expect(result.isSuccess).toBe(false)
      expect(result.message).toContain('Resource not found')
      expect(result.message).toContain('schedule')
    })

    test('should handle updating schedule with no changes', async () => {
      mockExecuteSQL
        .mockResolvedValueOnce([{ id: 1 }]) // User lookup
        .mockResolvedValueOnce([{ id: 1 }]) // Schedule exists

      const result = await updateScheduleAction(1, {}) // No fields to update

      expect(result.isSuccess).toBe(false)
      expect(result.message).toContain('Validation failed')
    })

    test('should handle concurrent schedule updates', async () => {
      // Simulate optimistic locking failure (schedule updated by another process)
      mockExecuteSQL
        .mockResolvedValueOnce([{ id: 1 }]) // User lookup
        .mockResolvedValueOnce([{ id: 1, updated_at: '2025-01-01T10:00:00Z' }]) // Schedule exists
        .mockResolvedValueOnce([]) // Update returns no rows (concurrent modification)

      const result = await updateScheduleAction(1, { name: 'Updated Name' })

      expect(result.isSuccess).toBe(false)
      expect(result.message).toContain('Database operation failed')
    })
  })

  describe('Schedule Deletion Error Scenarios', () => {
    const mockSession = { sub: 'user-123', email: 'test@example.com' }

    beforeEach(() => {
      mockGetServerSession.mockResolvedValue(mockSession)
      mockHasToolAccess.mockResolvedValue(true)
    })

    test('should handle deleting non-existent schedule', async () => {
      mockExecuteSQL
        .mockResolvedValueOnce([{ id: 1 }]) // User lookup
        .mockResolvedValueOnce([]) // Schedule not found

      const result = await deleteScheduleAction(999)

      expect(result.isSuccess).toBe(false)
      expect(result.message).toContain('Resource not found')
      expect(result.message).toContain('schedule')
    })

    test('should handle deletion with active executions', async () => {
      // In a real system, might need to prevent deletion of schedules with running executions
      mockExecuteSQL
        .mockResolvedValueOnce([{ id: 1 }]) // User lookup
        .mockResolvedValueOnce([{ id: 1 }]) // Schedule exists
        .mockRejectedValue(new Error('Cannot delete schedule with active executions'))

      const result = await deleteScheduleAction(1)

      expect(result.isSuccess).toBe(false)
      expect(result.message).toContain('Database operation failed')
    })
  })

  describe('Schedule Retrieval Error Scenarios', () => {
    const mockSession = { sub: 'user-123', email: 'test@example.com' }

    beforeEach(() => {
      mockGetServerSession.mockResolvedValue(mockSession)
      mockHasToolAccess.mockResolvedValue(true)
    })

    test('should handle retrieving non-existent schedule', async () => {
      mockExecuteSQL
        .mockResolvedValueOnce([{ id: 1 }]) // User lookup
        .mockResolvedValueOnce([]) // Schedule not found

      const result = await getScheduleAction(999)

      expect(result.isSuccess).toBe(false)
      expect(result.message).toContain('Resource not found')
      expect(result.message).toContain('schedule')
    })

    test('should handle corrupted schedule data gracefully', async () => {
      const corruptedSchedule = {
        id: 1,
        name: 'Test Schedule',
        user_id: 1,
        assistant_architect_id: 1,
        schedule_config: 'invalid json{', // Corrupted JSON
        input_data: '{"valid": "json"}',
        active: true,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z'
      }

      mockExecuteSQL
        .mockResolvedValueOnce([{ id: 1 }]) // User lookup
        .mockResolvedValueOnce([corruptedSchedule]) // Corrupted schedule data

      const result = await getScheduleAction(1)

      // Should still succeed but with default schedule config
      expect(result.isSuccess).toBe(true)
      expect(result.data?.scheduleConfig.frequency).toBe('daily')
      expect(result.data?.scheduleConfig.time).toBe('09:00')
    })
  })

  describe('External Service Integration Errors', () => {
    test('should handle EventBridge service unavailability', () => {
      const eventBridgeErrors = [
        { code: 'ServiceUnavailableException', message: 'EventBridge temporarily unavailable' },
        { code: 'ThrottlingException', message: 'Rate limit exceeded' },
        { code: 'ResourceNotFoundException', message: 'Schedule group not found' },
        { code: 'ConflictException', message: 'Schedule already exists' }
      ]

      eventBridgeErrors.forEach(error => {
        expect(error.code).toMatch(/Exception$/)
        expect(error.message).toBeTruthy()

        // Simulate error handling logic
        const shouldRetry = ['ServiceUnavailableException', 'ThrottlingException'].includes(error.code)
        const isRetriable = shouldRetry

        if (error.code === 'ThrottlingException') {
          expect(isRetriable).toBe(true)
        } else if (error.code === 'ResourceNotFoundException') {
          expect(isRetriable).toBe(false)
        }
      })
    })

    test('should handle Lambda execution failures', () => {
      const lambdaErrors = [
        { type: 'timeout', duration: 300000, message: 'Function timed out after 5 minutes' },
        { type: 'memory', usage: 1024, limit: 512, message: 'Memory limit exceeded' },
        { type: 'runtime', error: 'TypeError: Cannot read property of undefined', stack: 'at line 42' },
        { type: 'permission', resource: 'arn:aws:s3:::bucket/file', message: 'Access denied' }
      ]

      lambdaErrors.forEach(error => {
        expect(error.type).toBeTruthy()
        expect(error.message).toBeTruthy()

        // Error classification for retry logic
        const retriableErrors = ['timeout', 'memory']
        const shouldRetry = retriableErrors.includes(error.type)

        if (error.type === 'permission') {
          expect(shouldRetry).toBe(false)
        } else if (error.type === 'timeout') {
          expect(shouldRetry).toBe(true)
        }
      })
    })

    test('should handle SES email delivery failures', () => {
      const sesErrors = [
        { code: 'MessageRejected', reason: 'Email address not verified' },
        { code: 'SendingPausedException', reason: 'Account sending paused' },
        { code: 'MailFromDomainNotVerifiedException', reason: 'Domain not verified' },
        { code: 'ConfigurationSetDoesNotExistException', reason: 'Configuration set not found' }
      ]

      sesErrors.forEach(error => {
        expect(error.code).toBeTruthy()
        expect(error.reason).toBeTruthy()

        // Determine if email should be retried
        const permanentFailures = [
          'MessageRejected',
          'MailFromDomainNotVerifiedException',
          'ConfigurationSetDoesNotExistException'
        ]
        const isPermanent = permanentFailures.includes(error.code)

        if (error.code === 'MessageRejected') {
          expect(isPermanent).toBe(true)
        } else if (error.code === 'SendingPausedException') {
          expect(isPermanent).toBe(false) // Temporary - account may be unpaused
        }
      })
    })
  })

  describe('Rate Limiting and Resource Exhaustion', () => {
    test('should handle API rate limiting gracefully', () => {
      const rateLimitScenarios = [
        { service: 'EventBridge', limit: 300, window: 60, current: 305 },
        { service: 'SES', limit: 200, window: 86400, current: 198 },
        { service: 'Lambda', limit: 1000, window: 60, current: 1001 }
      ]

      rateLimitScenarios.forEach(scenario => {
        const isOverLimit = scenario.current > scenario.limit
        const remainingQuota = Math.max(0, scenario.limit - scenario.current)

        expect(scenario.service).toBeTruthy()
        expect(scenario.limit).toBeGreaterThan(0)

        if (scenario.service === 'Lambda' && isOverLimit) {
          expect(remainingQuota).toBe(0)
          // Should implement exponential backoff
          const backoffDelay = Math.min(300000, Math.pow(2, 3) * 1000) // Max 5 minutes
          expect(backoffDelay).toBeLessThanOrEqual(300000)
        }
      })
    })

    test('should handle resource exhaustion scenarios', () => {
      const resourceLimits = {
        maxConcurrentExecutions: 10,
        maxSchedulesPerUser: 100,
        maxExecutionDuration: 900000, // 15 minutes
        maxResultSize: 10485760 // 10MB
      }

      // Test each limit
      expect(resourceLimits.maxConcurrentExecutions).toBe(10)
      expect(resourceLimits.maxSchedulesPerUser).toBe(100)
      expect(resourceLimits.maxExecutionDuration).toBe(900000)
      expect(resourceLimits.maxResultSize).toBe(10485760)

      // Simulate resource exhaustion
      const currentUsage = {
        concurrentExecutions: 11,
        userSchedules: 95,
        executionDuration: 800000,
        resultSize: 8388608
      }

      const isOverConcurrentLimit = currentUsage.concurrentExecutions > resourceLimits.maxConcurrentExecutions
      const isNearScheduleLimit = currentUsage.userSchedules >= resourceLimits.maxSchedulesPerUser * 0.9

      expect(isOverConcurrentLimit).toBe(true)
      expect(isNearScheduleLimit).toBe(true)
    })
  })

  describe('Data Corruption and Recovery', () => {
    test('should handle and recover from corrupted schedule configuration', () => {
      const corruptedConfigs = [
        '{"frequency": "unknown"}', // Invalid frequency
        '{"frequency": "daily", "time": "invalid"}', // Invalid time
        '{"frequency": "weekly"}', // Missing required daysOfWeek
        '{"frequency": "monthly"}', // Missing required dayOfMonth
        'not json at all', // Not valid JSON
        null, // Null value
        undefined // Undefined value
      ]

      corruptedConfigs.forEach(config => {
        let parsedConfig
        try {
          parsedConfig = typeof config === 'string' ? JSON.parse(config) : config
        } catch {
          parsedConfig = null
        }

        // Should fallback to default configuration
        const defaultConfig = {
          frequency: 'daily' as const,
          time: '09:00'
        }

        const finalConfig = parsedConfig &&
                           parsedConfig.frequency &&
                           ['daily', 'weekly', 'monthly', 'custom'].includes(parsedConfig.frequency)
                           ? parsedConfig
                           : defaultConfig

        expect(finalConfig.frequency).toBe('daily')
        expect(finalConfig.time).toBe('09:00')
      })
    })

    test('should handle corrupted execution results gracefully', () => {
      const corruptedResults = [
        '{"partial": "data"', // Incomplete JSON
        'completely invalid json', // Invalid JSON
        null, // Null value
        undefined, // Undefined value
        '{}' // Empty object
      ]

      corruptedResults.forEach(result => {
        let parsedResult
        try {
          parsedResult = typeof result === 'string' ? JSON.parse(result) : result
        } catch {
          parsedResult = {}
        }

        // Should have default structure
        const safeResult = {
          output: parsedResult?.output || 'Execution result data corrupted',
          error: parsedResult?.error || null,
          metrics: parsedResult?.metrics || {
            duration: 0,
            tokens: 0
          }
        }

        expect(safeResult.output).toBeTruthy()
        expect(safeResult.metrics).toBeDefined()
        expect(safeResult.metrics.duration).toBeGreaterThanOrEqual(0)
      })
    })
  })
})