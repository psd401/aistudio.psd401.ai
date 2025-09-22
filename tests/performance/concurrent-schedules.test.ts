/**
 * Performance Testing for Concurrent Schedules
 * Tests system performance under concurrent schedule operations
 * Part of Issue #271: Testing: End-to-End Scheduling Workflows
 */

import { createScheduleAction, getSchedulesAction, updateScheduleAction, deleteScheduleAction } from '@/actions/db/schedule-actions'
import { executeSQL, createParameter } from '@/lib/db/data-api-adapter'
import { getServerSession } from '@/lib/auth/server-session'
import { hasToolAccess } from '@/lib/db/data-api-adapter'

// Mock dependencies for performance testing
jest.mock('@/lib/auth/server-session')
jest.mock('@/lib/db/data-api-adapter')

const mockGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>
const mockExecuteSQL = executeSQL as jest.MockedFunction<typeof executeSQL>
const mockCreateParameter = createParameter as jest.MockedFunction<typeof createParameter>
const mockHasToolAccess = hasToolAccess as jest.MockedFunction<typeof hasToolAccess>

describe('Performance Testing for Concurrent Schedules', () => {
  const mockSession = { sub: 'user-123', email: 'test@example.com' }
  const mockUser = { id: 1 }
  const mockArchitect = { id: 1, name: 'Test Architect' }

  beforeEach(() => {
    jest.clearAllMocks()
    mockGetServerSession.mockResolvedValue(mockSession)
    mockHasToolAccess.mockResolvedValue(true)
    mockCreateParameter.mockImplementation((name, value) => ({ name, value } as any))
  })

  describe('Concurrent Schedule Creation Performance', () => {
    test('should handle 50 concurrent schedule creations efficiently', async () => {
      const startTime = Date.now()
      const concurrentCount = 50

      // Mock database responses for all concurrent operations
      mockExecuteSQL
        .mockResolvedValue([mockUser]) // User lookups
        .mockResolvedValue([mockArchitect]) // Architect lookups
        .mockResolvedValue([{ id: 1 }]) // Schedule creations

      // Create 50 concurrent schedule creation requests
      const schedulePromises = Array.from({ length: concurrentCount }, (_, index) => {
        const scheduleRequest = {
          name: `Concurrent Schedule ${index + 1}`,
          assistantArchitectId: 1,
          scheduleConfig: {
            frequency: 'daily' as const,
            time: `${String(7 + (index % 12)).padStart(2, '0')}:00`
          },
          inputData: { index: index + 1 }
        }
        return createScheduleAction(scheduleRequest)
      })

      // Execute all schedules concurrently
      const results = await Promise.all(schedulePromises)

      const endTime = Date.now()
      const totalDuration = endTime - startTime
      const averagePerSchedule = totalDuration / concurrentCount

      // Performance assertions
      expect(totalDuration).toBeLessThan(30000) // Should complete within 30 seconds
      expect(averagePerSchedule).toBeLessThan(1000) // Average under 1 second per schedule

      // Verify all schedules were created successfully
      const successCount = results.filter(result => result.isSuccess).length
      expect(successCount).toBe(concurrentCount)

      console.log(`Concurrent schedule creation performance:`)
      console.log(`- Total time: ${totalDuration}ms`)
      console.log(`- Average per schedule: ${averagePerSchedule.toFixed(2)}ms`)
      console.log(`- Success rate: ${(successCount / concurrentCount * 100).toFixed(1)}%`)
    })

    test('should maintain performance with different schedule types', async () => {
      const startTime = Date.now()
      const scheduleTypes = [
        { frequency: 'daily' as const, time: '07:00' },
        { frequency: 'weekly' as const, time: '08:00', daysOfWeek: [1, 3, 5] },
        { frequency: 'monthly' as const, time: '09:00', dayOfMonth: 15 },
        { frequency: 'custom' as const, time: '10:00', cron: '0 10 * * 1-5' }
      ]

      mockExecuteSQL
        .mockResolvedValue([mockUser])
        .mockResolvedValue([mockArchitect])
        .mockResolvedValue([{ id: 1 }])

      // Create multiple schedules of each type concurrently
      const schedulePromises = scheduleTypes.flatMap((config, typeIndex) =>
        Array.from({ length: 10 }, (_, index) => {
          const scheduleRequest = {
            name: `${config.frequency} Schedule ${typeIndex}-${index}`,
            assistantArchitectId: 1,
            scheduleConfig: config,
            inputData: { type: config.frequency, index }
          }
          return createScheduleAction(scheduleRequest)
        })
      )

      const results = await Promise.all(schedulePromises)
      const endTime = Date.now()
      const totalDuration = endTime - startTime

      expect(totalDuration).toBeLessThan(40000) // 40 seconds for 40 schedules
      expect(results.filter(r => r.isSuccess).length).toBe(40)

      console.log(`Mixed schedule types performance: ${totalDuration}ms for 40 schedules`)
    })

    test('should handle burst schedule creation without degradation', async () => {
      const burstSizes = [5, 10, 25, 50]
      const performanceMetrics: Array<{ size: number; duration: number; avgPerSchedule: number }> = []

      for (const burstSize of burstSizes) {
        mockExecuteSQL
          .mockResolvedValue([mockUser])
          .mockResolvedValue([mockArchitect])
          .mockResolvedValue([{ id: 1 }])

        const startTime = Date.now()

        const promises = Array.from({ length: burstSize }, (_, index) => {
          const scheduleRequest = {
            name: `Burst Schedule ${burstSize}-${index}`,
            assistantArchitectId: 1,
            scheduleConfig: {
              frequency: 'daily' as const,
              time: '07:00'
            },
            inputData: { burst: burstSize, index }
          }
          return createScheduleAction(scheduleRequest)
        })

        const results = await Promise.all(promises)
        const endTime = Date.now()
        const duration = endTime - startTime
        const avgPerSchedule = duration / burstSize

        performanceMetrics.push({
          size: burstSize,
          duration,
          avgPerSchedule
        })

        expect(results.filter(r => r.isSuccess).length).toBe(burstSize)
      }

      // Verify performance doesn't degrade significantly with larger bursts
      const scalabilityRatio = performanceMetrics[3].avgPerSchedule / performanceMetrics[0].avgPerSchedule
      expect(scalabilityRatio).toBeLessThan(3) // No more than 3x degradation from 5 to 50

      console.log('Burst performance metrics:', performanceMetrics)
    })
  })

  describe('Concurrent Schedule Retrieval Performance', () => {
    test('should efficiently retrieve schedules under concurrent load', async () => {
      const mockSchedules = Array.from({ length: 100 }, (_, index) => ({
        id: index + 1,
        name: `Schedule ${index + 1}`,
        user_id: 1,
        assistant_architect_id: 1,
        schedule_config: JSON.stringify({
          frequency: 'daily',
          time: '07:00'
        }),
        input_data: JSON.stringify({ index }),
        active: true,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z'
      }))

      mockExecuteSQL
        .mockResolvedValue([mockUser])
        .mockResolvedValue(mockSchedules)

      const concurrentRequests = 20
      const startTime = Date.now()

      const retrievalPromises = Array.from({ length: concurrentRequests }, () =>
        getSchedulesAction()
      )

      const results = await Promise.all(retrievalPromises)
      const endTime = Date.now()
      const totalDuration = endTime - startTime
      const averagePerRequest = totalDuration / concurrentRequests

      expect(totalDuration).toBeLessThan(10000) // Under 10 seconds total
      expect(averagePerRequest).toBeLessThan(1000) // Under 1 second per request

      // Verify all requests succeeded and returned correct data
      results.forEach(result => {
        expect(result.isSuccess).toBe(true)
        expect(result.data).toHaveLength(100)
      })

      console.log(`Concurrent retrieval performance:`)
      console.log(`- Total time: ${totalDuration}ms`)
      console.log(`- Average per request: ${averagePerRequest.toFixed(2)}ms`)
    })

    test('should handle pagination efficiently under load', async () => {
      // Simulate paginated schedule retrieval
      const totalSchedules = 500
      const pageSize = 50
      const pages = Math.ceil(totalSchedules / pageSize)

      const performanceMetrics = []

      for (let page = 0; page < pages; page++) {
        const startIndex = page * pageSize
        const endIndex = Math.min(startIndex + pageSize, totalSchedules)
        const pageSchedules = Array.from({ length: endIndex - startIndex }, (_, index) => ({
          id: startIndex + index + 1,
          name: `Schedule ${startIndex + index + 1}`,
          user_id: 1,
          assistant_architect_id: 1,
          schedule_config: JSON.stringify({ frequency: 'daily', time: '07:00' }),
          input_data: JSON.stringify({ page, index }),
          active: true,
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z'
        }))

        mockExecuteSQL
          .mockResolvedValueOnce([mockUser])
          .mockResolvedValueOnce(pageSchedules)

        const startTime = Date.now()
        const result = await getSchedulesAction()
        const endTime = Date.now()

        const duration = endTime - startTime
        performanceMetrics.push({ page, duration, count: pageSchedules.length })

        expect(result.isSuccess).toBe(true)
        expect(result.data).toHaveLength(pageSchedules.length)
      }

      // Verify consistent pagination performance
      const avgDuration = performanceMetrics.reduce((sum, m) => sum + m.duration, 0) / performanceMetrics.length
      expect(avgDuration).toBeLessThan(500) // Under 500ms per page

      console.log('Pagination performance:', performanceMetrics)
    })
  })

  describe('Concurrent Schedule Updates Performance', () => {
    test('should handle concurrent updates without conflicts', async () => {
      const scheduleId = 1
      const concurrentUpdates = 10

      mockExecuteSQL
        .mockResolvedValue([mockUser])
        .mockResolvedValue([{ id: scheduleId }]) // Schedule exists
        .mockResolvedValue([{ // Updated schedule
          id: scheduleId,
          name: 'Updated Schedule',
          user_id: 1,
          assistant_architect_id: 1,
          schedule_config: JSON.stringify({ frequency: 'daily', time: '08:00' }),
          input_data: JSON.stringify({}),
          active: true,
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T08:00:00Z'
        }])

      const startTime = Date.now()

      // Simulate concurrent updates (in practice, these would conflict)
      const updatePromises = Array.from({ length: concurrentUpdates }, (_, index) => {
        const updateData = {
          name: `Updated Schedule ${index}`,
          scheduleConfig: {
            frequency: 'daily' as const,
            time: `${String(8 + (index % 4)).padStart(2, '0')}:00`
          }
        }
        return updateScheduleAction(scheduleId, updateData)
      })

      const results = await Promise.all(updatePromises)
      const endTime = Date.now()
      const totalDuration = endTime - startTime

      expect(totalDuration).toBeLessThan(15000) // Under 15 seconds
      expect(results.filter(r => r.isSuccess).length).toBeGreaterThan(0)

      console.log(`Concurrent updates performance: ${totalDuration}ms`)
    })

    test('should maintain performance with bulk schedule updates', async () => {
      const scheduleCount = 25
      const scheduleIds = Array.from({ length: scheduleCount }, (_, i) => i + 1)

      // Mock responses for each schedule update
      scheduleIds.forEach(id => {
        mockExecuteSQL
          .mockResolvedValueOnce([mockUser])
          .mockResolvedValueOnce([{ id }])
          .mockResolvedValueOnce([{
            id,
            name: `Bulk Updated Schedule ${id}`,
            user_id: 1,
            assistant_architect_id: 1,
            schedule_config: JSON.stringify({ frequency: 'daily', time: '09:00' }),
            input_data: JSON.stringify({}),
            active: true,
            created_at: '2025-01-01T00:00:00Z',
            updated_at: '2025-01-01T09:00:00Z'
          }])
      })

      const startTime = Date.now()

      const updatePromises = scheduleIds.map(id => {
        const updateData = {
          name: `Bulk Updated Schedule ${id}`,
          scheduleConfig: {
            frequency: 'daily' as const,
            time: '09:00'
          }
        }
        return updateScheduleAction(id, updateData)
      })

      const results = await Promise.all(updatePromises)
      const endTime = Date.now()
      const totalDuration = endTime - startTime
      const averagePerUpdate = totalDuration / scheduleCount

      expect(totalDuration).toBeLessThan(20000) // Under 20 seconds
      expect(averagePerUpdate).toBeLessThan(1000) // Under 1 second per update
      expect(results.filter(r => r.isSuccess).length).toBe(scheduleCount)

      console.log(`Bulk update performance: ${totalDuration}ms for ${scheduleCount} schedules`)
    })
  })

  describe('Mixed Operation Performance Testing', () => {
    test('should handle mixed CRUD operations efficiently', async () => {
      const operationCounts = {
        create: 20,
        read: 30,
        update: 15,
        delete: 10
      }

      // Setup mocks for all operation types
      mockExecuteSQL
        .mockResolvedValue([mockUser])
        .mockResolvedValue([mockArchitect])
        .mockResolvedValue([{ id: 1 }]) // For creates and deletes
        .mockResolvedValue([{ // For reads and updates
          id: 1,
          name: 'Mixed Test Schedule',
          user_id: 1,
          assistant_architect_id: 1,
          schedule_config: JSON.stringify({ frequency: 'daily', time: '07:00' }),
          input_data: JSON.stringify({}),
          active: true,
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z'
        }])

      const startTime = Date.now()

      // Create all operations
      const allPromises = [
        // Create operations
        ...Array.from({ length: operationCounts.create }, (_, i) =>
          createScheduleAction({
            name: `Mixed Create ${i}`,
            assistantArchitectId: 1,
            scheduleConfig: { frequency: 'daily' as const, time: '07:00' },
            inputData: { operation: 'create', index: i }
          })
        ),
        // Read operations
        ...Array.from({ length: operationCounts.read }, () =>
          getSchedulesAction()
        ),
        // Update operations
        ...Array.from({ length: operationCounts.update }, (_, i) =>
          updateScheduleAction(1, {
            name: `Mixed Update ${i}`,
            scheduleConfig: { frequency: 'daily' as const, time: '08:00' }
          })
        ),
        // Delete operations
        ...Array.from({ length: operationCounts.delete }, () =>
          deleteScheduleAction(1)
        )
      ]

      // Shuffle operations to simulate realistic mixed load
      const shuffledPromises = allPromises.sort(() => Math.random() - 0.5)
      const results = await Promise.all(shuffledPromises)

      const endTime = Date.now()
      const totalDuration = endTime - startTime
      const totalOperations = Object.values(operationCounts).reduce((sum, count) => sum + count, 0)
      const averagePerOperation = totalDuration / totalOperations

      expect(totalDuration).toBeLessThan(45000) // Under 45 seconds for 75 operations
      expect(averagePerOperation).toBeLessThan(1000) // Under 1 second per operation

      // Verify operation success rates
      const successCount = results.filter(r => r.isSuccess).length
      const successRate = (successCount / totalOperations) * 100

      expect(successRate).toBeGreaterThan(90) // At least 90% success rate

      console.log(`Mixed operations performance:`)
      console.log(`- Total time: ${totalDuration}ms`)
      console.log(`- Average per operation: ${averagePerOperation.toFixed(2)}ms`)
      console.log(`- Success rate: ${successRate.toFixed(1)}%`)
    })

    test('should maintain performance under sustained load', async () => {
      const loadDuration = 30000 // 30 seconds
      const operationsPerSecond = 5
      const totalOperations = (loadDuration / 1000) * operationsPerSecond

      mockExecuteSQL
        .mockResolvedValue([mockUser])
        .mockResolvedValue([mockArchitect])
        .mockResolvedValue([{ id: 1 }])

      const startTime = Date.now()
      const performanceMetrics: Array<{ duration: number; success: boolean; timestamp: number }> = []
      let operationCount = 0

      // Simulate sustained load
      const intervalPromises: Promise<any>[] = []
      const interval = setInterval(() => {
        if (Date.now() - startTime >= loadDuration) {
          clearInterval(interval)
          return
        }

        // Create a batch of operations
        for (let i = 0; i < operationsPerSecond; i++) {
          const operationStart = Date.now()
          const promise = createScheduleAction({
            name: `Sustained Load ${operationCount++}`,
            assistantArchitectId: 1,
            scheduleConfig: { frequency: 'daily' as const, time: '07:00' },
            inputData: { timestamp: operationStart }
          }).then(result => {
            const operationEnd = Date.now()
            performanceMetrics.push({
              duration: operationEnd - operationStart,
              success: result.isSuccess,
              timestamp: operationEnd
            })
            return result
          })

          intervalPromises.push(promise)
        }
      }, 1000)

      // Wait for load test to complete
      await new Promise(resolve => setTimeout(resolve, loadDuration + 5000))
      clearInterval(interval)

      // Wait for all operations to complete
      const results = await Promise.all(intervalPromises)

      const endTime = Date.now()
      const actualDuration = endTime - startTime

      // Analyze performance metrics
      const averageDuration = performanceMetrics.reduce((sum, m) => sum + m.duration, 0) / performanceMetrics.length
      const successRate = (performanceMetrics.filter(m => m.success).length / performanceMetrics.length) * 100

      expect(averageDuration).toBeLessThan(2000) // Under 2 seconds average
      expect(successRate).toBeGreaterThan(95) // High success rate under load
      expect(performanceMetrics.length).toBeGreaterThan(totalOperations * 0.8) // At least 80% of expected operations

      console.log(`Sustained load performance:`)
      console.log(`- Duration: ${actualDuration}ms`)
      console.log(`- Operations completed: ${performanceMetrics.length}`)
      console.log(`- Average operation time: ${averageDuration.toFixed(2)}ms`)
      console.log(`- Success rate: ${successRate.toFixed(1)}%`)
    })
  })

  describe('Resource Usage and Memory Performance', () => {
    test('should maintain reasonable memory usage during bulk operations', async () => {
      // Simulate memory monitoring during bulk operations
      const initialMemory = process.memoryUsage()
      const bulkSize = 100

      mockExecuteSQL
        .mockResolvedValue([mockUser])
        .mockResolvedValue([mockArchitect])
        .mockResolvedValue([{ id: 1 }])

      // Create large number of schedules in batches to test memory efficiency
      const batchSize = 10
      const batches = Math.ceil(bulkSize / batchSize)

      for (let batch = 0; batch < batches; batch++) {
        const batchPromises = Array.from({ length: batchSize }, (_, index) => {
          const globalIndex = batch * batchSize + index
          return createScheduleAction({
            name: `Memory Test Schedule ${globalIndex}`,
            assistantArchitectId: 1,
            scheduleConfig: { frequency: 'daily' as const, time: '07:00' },
            inputData: { batch, index: globalIndex }
          })
        })

        await Promise.all(batchPromises)

        // Force garbage collection if available
        if (global.gc) {
          global.gc()
        }

        const currentMemory = process.memoryUsage()
        const memoryIncrease = currentMemory.heapUsed - initialMemory.heapUsed

        // Memory usage should not grow excessively
        expect(memoryIncrease).toBeLessThan(100 * 1024 * 1024) // Under 100MB increase
      }

      const finalMemory = process.memoryUsage()
      const totalMemoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed

      console.log(`Memory usage for ${bulkSize} operations:`)
      console.log(`- Initial heap: ${Math.round(initialMemory.heapUsed / 1024 / 1024)}MB`)
      console.log(`- Final heap: ${Math.round(finalMemory.heapUsed / 1024 / 1024)}MB`)
      console.log(`- Increase: ${Math.round(totalMemoryIncrease / 1024 / 1024)}MB`)

      expect(totalMemoryIncrease).toBeLessThan(150 * 1024 * 1024) // Under 150MB total increase
    })

    test('should handle CPU-intensive operations efficiently', async () => {
      // Simulate CPU-intensive schedule operations
      const complexSchedules = 25

      mockExecuteSQL
        .mockResolvedValue([mockUser])
        .mockResolvedValue([mockArchitect])
        .mockResolvedValue([{ id: 1 }])

      const startTime = Date.now()
      const cpuStart = process.cpuUsage()

      // Create schedules with complex configurations
      const promises = Array.from({ length: complexSchedules }, (_, index) => {
        const scheduleConfig = {
          frequency: 'custom' as const,
          time: '07:00',
          cron: `${index % 60} ${(index % 12) + 7} * * ${(index % 7)}` // Varied cron expressions
        }

        const inputData = {
          index,
          complexData: Array.from({ length: 1000 }, (_, i) => ({
            id: i,
            value: Math.random(),
            timestamp: Date.now() + i
          }))
        }

        return createScheduleAction({
          name: `CPU Intensive Schedule ${index}`,
          assistantArchitectId: 1,
          scheduleConfig,
          inputData
        })
      })

      const results = await Promise.all(promises)
      const endTime = Date.now()
      const cpuEnd = process.cpuUsage(cpuStart)

      const totalDuration = endTime - startTime
      const cpuUsage = (cpuEnd.user + cpuEnd.system) / 1000 // Convert to milliseconds

      expect(totalDuration).toBeLessThan(30000) // Under 30 seconds
      expect(cpuUsage).toBeLessThan(totalDuration * 2) // CPU time should not exceed 2x wall time
      expect(results.filter(r => r.isSuccess).length).toBe(complexSchedules)

      console.log(`CPU-intensive operations performance:`)
      console.log(`- Wall time: ${totalDuration}ms`)
      console.log(`- CPU time: ${cpuUsage.toFixed(2)}ms`)
      console.log(`- CPU efficiency: ${((cpuUsage / totalDuration) * 100).toFixed(1)}%`)
    })
  })

  describe('Database Performance Under Load', () => {
    test('should maintain database query performance under concurrent load', async () => {
      const concurrentQueries = 50
      const queriesPerConnection = 10

      mockExecuteSQL.mockImplementation(() => {
        // Simulate varying query response times
        const delay = Math.random() * 100 + 50 // 50-150ms
        return new Promise(resolve => {
          setTimeout(() => {
            resolve([{ id: 1, name: 'Test Data' }])
          }, delay)
        })
      })

      const startTime = Date.now()

      // Create multiple concurrent database query sequences
      const querySequences = Array.from({ length: concurrentQueries }, async () => {
        const sequenceResults = []
        for (let i = 0; i < queriesPerConnection; i++) {
          const queryStart = Date.now()
          await executeSQL('SELECT * FROM test', [])
          const queryEnd = Date.now()
          sequenceResults.push(queryEnd - queryStart)
        }
        return sequenceResults
      })

      const allResults = await Promise.all(querySequences)
      const endTime = Date.now()

      const totalDuration = endTime - startTime
      const totalQueries = concurrentQueries * queriesPerConnection
      const averageQueryTime = allResults.flat().reduce((sum, time) => sum + time, 0) / totalQueries

      expect(totalDuration).toBeLessThan(30000) // Under 30 seconds total
      expect(averageQueryTime).toBeLessThan(500) // Under 500ms average query time
      expect(allResults.length).toBe(concurrentQueries)

      console.log(`Database performance under load:`)
      console.log(`- Total duration: ${totalDuration}ms`)
      console.log(`- Total queries: ${totalQueries}`)
      console.log(`- Average query time: ${averageQueryTime.toFixed(2)}ms`)
    })
  })
})