"use server"

import { executeSQL, createParameter, hasToolAccess } from "@/lib/db/data-api-adapter"
import { transformSnakeToCamel } from "@/lib/db/field-mapper"
import { createLogger, generateRequestId, startTimer, sanitizeForLogging } from "@/lib/logger"
import { handleError, ErrorFactories, createSuccess } from "@/lib/error-utils"
import { getServerSession } from "@/lib/auth/server-session"
import { ActionState } from "@/types"

// Types for Schedule Management
export interface ScheduleConfig {
  frequency: 'daily' | 'weekly' | 'monthly' | 'custom'
  time: string // HH:MM format
  timezone?: string
  cron?: string // for custom schedules
  daysOfWeek?: number[] // for weekly (0=Sunday, 6=Saturday)
  dayOfMonth?: number // for monthly (1-31)
}

export interface CreateScheduleRequest {
  name: string
  assistantArchitectId: number
  scheduleConfig: ScheduleConfig
  inputData: Record<string, any>
}

export interface Schedule {
  id: number
  name: string
  userId: number
  assistantArchitectId: number
  scheduleConfig: ScheduleConfig
  inputData: Record<string, any>
  active: boolean
  createdAt: string
  updatedAt: string
  nextExecution?: string
  lastExecution?: {
    executedAt: string
    status: 'success' | 'failed'
  }
}

export interface UpdateScheduleRequest extends Partial<CreateScheduleRequest> {
  active?: boolean
}

// Maximum schedules per user
const MAX_SCHEDULES_PER_USER = 10

/**
 * Validates schedule configuration
 */
function validateScheduleConfig(config: ScheduleConfig): { isValid: boolean; errors: string[] } {
  const errors: string[] = []

  // Validate frequency
  if (!['daily', 'weekly', 'monthly', 'custom'].includes(config.frequency)) {
    errors.push('Invalid frequency. Must be daily, weekly, monthly, or custom')
  }

  // Validate time format (HH:MM)
  const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/
  if (!timeRegex.test(config.time)) {
    errors.push('Invalid time format. Must be HH:MM (24-hour format)')
  }

  // Validate frequency-specific fields
  if (config.frequency === 'weekly' && config.daysOfWeek) {
    if (!Array.isArray(config.daysOfWeek) || config.daysOfWeek.length === 0) {
      errors.push('daysOfWeek must be a non-empty array for weekly schedules')
    } else if (config.daysOfWeek.some(day => day < 0 || day > 6)) {
      errors.push('daysOfWeek must contain values between 0 (Sunday) and 6 (Saturday)')
    }
  }

  if (config.frequency === 'monthly' && config.dayOfMonth) {
    if (config.dayOfMonth < 1 || config.dayOfMonth > 31) {
      errors.push('dayOfMonth must be between 1 and 31')
    }
  }

  if (config.frequency === 'custom') {
    if (!config.cron) {
      errors.push('cron expression is required for custom schedules')
    } else {
      // Basic cron validation (5 fields)
      const cronFields = config.cron.trim().split(/\s+/)
      if (cronFields.length !== 5) {
        errors.push('cron expression must have exactly 5 fields (minute hour day month day-of-week)')
      }
    }
  }

  // Validate timezone if provided
  if (config.timezone) {
    try {
      Intl.DateTimeFormat(undefined, { timeZone: config.timezone })
    } catch {
      errors.push('Invalid timezone identifier')
    }
  }

  return { isValid: errors.length === 0, errors }
}

/**
 * Creates a new schedule
 */
export async function createScheduleAction(params: CreateScheduleRequest): Promise<ActionState<{ id: number; scheduleArn?: string; nextExecution?: string }>> {
  const requestId = generateRequestId()
  const timer = startTimer("createScheduleAction")
  const log = createLogger({ requestId, action: "createSchedule" })

  try {
    log.info("Creating schedule", { params: sanitizeForLogging(params) })

    // Auth check
    const session = await getServerSession()
    if (!session || !session.sub) {
      log.warn("Unauthorized")
      throw ErrorFactories.authNoSession()
    }

    // Check if user has access to assistant-architect tool
    const hasAccess = await hasToolAccess(session.sub, "assistant-architect")
    if (!hasAccess) {
      log.warn("User lacks assistant-architect access")
      throw ErrorFactories.authzInsufficientPermissions("assistant-architect")
    }

    // Validate input
    const { name, assistantArchitectId, scheduleConfig, inputData } = params

    if (!name || name.trim().length === 0) {
      throw ErrorFactories.validationFailed([{ field: 'name', message: 'Name is required' }])
    }

    if (!assistantArchitectId || assistantArchitectId <= 0) {
      throw ErrorFactories.validationFailed([{ field: 'assistantArchitectId', message: 'Valid assistant architect ID is required' }])
    }

    // Validate schedule configuration
    const validation = validateScheduleConfig(scheduleConfig)
    if (!validation.isValid) {
      throw ErrorFactories.validationFailed(
        validation.errors.map(error => ({ field: 'scheduleConfig', message: error }))
      )
    }

    // Get user ID from sub
    const userResult = await executeSQL<{ id: number }>(`
      SELECT id FROM users WHERE cognito_sub = :cognitoSub
    `, [createParameter('cognitoSub', session.sub)])

    if (!userResult || userResult.length === 0) {
      log.warn("User not found")
      throw ErrorFactories.authzResourceNotFound("user", session.sub)
    }

    const userId = userResult[0].id

    // Check if assistant architect exists and user has access
    const architectResult = await executeSQL<{ id: number; name: string }>(`
      SELECT id, name FROM assistant_architects
      WHERE id = :architectId AND user_id = :userId
    `, [
      createParameter('architectId', assistantArchitectId),
      createParameter('userId', userId)
    ])

    if (!architectResult || architectResult.length === 0) {
      log.warn("Assistant architect not found or no access")
      throw ErrorFactories.authzInsufficientPermissions("assistant architect")
    }

    // Check if user has reached maximum schedules
    const countResult = await executeSQL<{ count: number }>(`
      SELECT COUNT(*) as count FROM scheduled_executions
      WHERE user_id = :userId AND active = true
    `, [createParameter('userId', userId)])

    const currentCount = countResult?.[0]?.count || 0
    if (currentCount >= MAX_SCHEDULES_PER_USER) {
      throw ErrorFactories.bizQuotaExceeded("schedule creation", MAX_SCHEDULES_PER_USER, currentCount)
    }

    // Check for duplicate name
    const duplicateResult = await executeSQL<{ id: number }>(`
      SELECT id FROM scheduled_executions
      WHERE user_id = :userId AND name = :name
    `, [
      createParameter('userId', userId),
      createParameter('name', name.trim())
    ])

    if (duplicateResult && duplicateResult.length > 0) {
      throw ErrorFactories.validationFailed([{ field: 'name', message: 'Schedule name already exists' }])
    }

    // Create the schedule
    const result = await executeSQL<{ id: number }>(`
      INSERT INTO scheduled_executions (
        user_id, assistant_architect_id, name, schedule_config, input_data, updated_by
      ) VALUES (
        :userId, :assistantArchitectId, :name, :scheduleConfig, :inputData, :updatedBy
      ) RETURNING id
    `, [
      createParameter('userId', userId),
      createParameter('assistantArchitectId', assistantArchitectId),
      createParameter('name', name.trim()),
      createParameter('scheduleConfig', JSON.stringify(scheduleConfig)),
      createParameter('inputData', JSON.stringify(inputData)),
      createParameter('updatedBy', session.sub)
    ])

    if (!result || result.length === 0) {
      throw ErrorFactories.dbQueryFailed("INSERT INTO scheduled_executions", new Error("Failed to create schedule"))
    }

    const scheduleId = result[0].id

    timer({ status: "success" })
    log.info("Schedule created successfully", { scheduleId })

    return createSuccess({ id: scheduleId }, "Schedule created successfully")

  } catch (error) {
    timer({ status: "error" })
    return handleError(error, "Failed to create schedule", {
      context: "createScheduleAction",
      requestId,
      operation: "createSchedule"
    })
  }
}

/**
 * Gets all schedules for the current user
 */
export async function getSchedulesAction(): Promise<ActionState<Schedule[]>> {
  const requestId = generateRequestId()
  const timer = startTimer("getSchedulesAction")
  const log = createLogger({ requestId, action: "getSchedules" })

  try {
    log.info("Getting user schedules")

    // Auth check
    const session = await getServerSession()
    if (!session || !session.sub) {
      log.warn("Unauthorized")
      throw ErrorFactories.authNoSession()
    }

    // Check if user has access to assistant-architect tool
    const hasAccess = await hasToolAccess(session.sub, "assistant-architect")
    if (!hasAccess) {
      log.warn("User lacks assistant-architect access")
      throw ErrorFactories.authzInsufficientPermissions("assistant-architect")
    }

    // Get user ID from sub
    const userResult = await executeSQL<{ id: number }>(`
      SELECT id FROM users WHERE cognito_sub = :cognitoSub
    `, [createParameter('cognitoSub', session.sub)])

    if (!userResult || userResult.length === 0) {
      log.warn("User not found")
      throw ErrorFactories.authzResourceNotFound("user", session.sub)
    }

    const userId = userResult[0].id

    // Get schedules with last execution info
    const result = await executeSQL<any>(`
      SELECT
        se.id,
        se.name,
        se.user_id,
        se.assistant_architect_id,
        se.schedule_config,
        se.input_data,
        se.active,
        se.created_at,
        se.updated_at,
        er.executed_at as last_executed_at,
        er.status as last_execution_status
      FROM scheduled_executions se
      LEFT JOIN LATERAL (
        SELECT executed_at, status
        FROM execution_results
        WHERE scheduled_execution_id = se.id
        ORDER BY executed_at DESC
        LIMIT 1
      ) er ON true
      WHERE se.user_id = :userId
      ORDER BY se.created_at DESC
    `, [createParameter('userId', userId)])

    // Transform results
    const schedules: Schedule[] = result.map(row => {
      const transformed = transformSnakeToCamel<any>(row)

      // Parse JSONB fields
      let scheduleConfig: ScheduleConfig
      let inputData: Record<string, any>

      try {
        scheduleConfig = typeof transformed.scheduleConfig === 'string'
          ? JSON.parse(transformed.scheduleConfig)
          : transformed.scheduleConfig
      } catch {
        scheduleConfig = { frequency: 'daily', time: '09:00' }
      }

      try {
        inputData = typeof transformed.inputData === 'string'
          ? JSON.parse(transformed.inputData)
          : transformed.inputData
      } catch {
        inputData = {}
      }

      const schedule: Schedule = {
        id: transformed.id,
        name: transformed.name,
        userId: transformed.userId,
        assistantArchitectId: transformed.assistantArchitectId,
        scheduleConfig,
        inputData,
        active: transformed.active,
        createdAt: transformed.createdAt,
        updatedAt: transformed.updatedAt
      }

      // Add last execution info if available
      if (transformed.lastExecutedAt && transformed.lastExecutionStatus) {
        schedule.lastExecution = {
          executedAt: transformed.lastExecutedAt,
          status: transformed.lastExecutionStatus
        }
      }

      return schedule
    })

    timer({ status: "success", count: schedules.length })
    log.info("Schedules retrieved successfully", { count: schedules.length })

    return createSuccess(schedules, "Schedules retrieved successfully")

  } catch (error) {
    timer({ status: "error" })
    return handleError(error, "Failed to get schedules", {
      context: "getSchedulesAction",
      requestId,
      operation: "getSchedules"
    })
  }
}

/**
 * Updates an existing schedule
 */
export async function updateScheduleAction(id: number, params: UpdateScheduleRequest): Promise<ActionState<Schedule>> {
  const requestId = generateRequestId()
  const timer = startTimer("updateScheduleAction")
  const log = createLogger({ requestId, action: "updateSchedule" })

  try {
    log.info("Updating schedule", { id, params: sanitizeForLogging(params) })

    // Auth check
    const session = await getServerSession()
    if (!session || !session.sub) {
      log.warn("Unauthorized")
      throw ErrorFactories.authNoSession()
    }

    // Check if user has access to assistant-architect tool
    const hasAccess = await hasToolAccess(session.sub, "assistant-architect")
    if (!hasAccess) {
      log.warn("User lacks assistant-architect access")
      throw ErrorFactories.authzInsufficientPermissions("assistant-architect")
    }

    // Get user ID from sub
    const userResult = await executeSQL<{ id: number }>(`
      SELECT id FROM users WHERE cognito_sub = :cognitoSub
    `, [createParameter('cognitoSub', session.sub)])

    if (!userResult || userResult.length === 0) {
      log.warn("User not found")
      throw ErrorFactories.authzResourceNotFound("user", session.sub)
    }

    const userId = userResult[0].id

    // Check if schedule exists and user owns it
    const existingResult = await executeSQL<any>(`
      SELECT id, name, user_id, assistant_architect_id, schedule_config, input_data, active, created_at, updated_at
      FROM scheduled_executions
      WHERE id = :id AND user_id = :userId
    `, [
      createParameter('id', id),
      createParameter('userId', userId)
    ])

    if (!existingResult || existingResult.length === 0) {
      log.warn("Schedule not found or no access")
      throw ErrorFactories.authzResourceNotFound("schedule", id.toString())
    }

    const existing = transformSnakeToCamel<any>(existingResult[0])

    // Build update query dynamically
    const updates: string[] = []
    const parameters: any[] = [
      createParameter('id', id),
      createParameter('userId', userId),
      createParameter('updatedBy', session.sub)
    ]

    if (params.name !== undefined) {
      if (!params.name || params.name.trim().length === 0) {
        throw ErrorFactories.validationFailed([{ field: 'name', message: 'Name is required' }])
      }

      // Check for duplicate name (excluding current schedule)
      const duplicateResult = await executeSQL<{ id: number }>(`
        SELECT id FROM scheduled_executions
        WHERE user_id = :userId AND name = :name AND id != :currentId
      `, [
        createParameter('userId', userId),
        createParameter('name', params.name.trim()),
        createParameter('currentId', id)
      ])

      if (duplicateResult && duplicateResult.length > 0) {
        throw ErrorFactories.validationFailed([{ field: 'name', message: 'Schedule name already exists' }])
      }

      updates.push('name = :name')
      parameters.push(createParameter('name', params.name.trim()))
    }

    if (params.assistantArchitectId !== undefined) {
      // Check if assistant architect exists and user has access
      const architectResult = await executeSQL<{ id: number }>(`
        SELECT id FROM assistant_architects
        WHERE id = :architectId AND user_id = :userId
      `, [
        createParameter('architectId', params.assistantArchitectId),
        createParameter('userId', userId)
      ])

      if (!architectResult || architectResult.length === 0) {
        throw ErrorFactories.authzInsufficientPermissions("assistant architect")
      }

      updates.push('assistant_architect_id = :assistantArchitectId')
      parameters.push(createParameter('assistantArchitectId', params.assistantArchitectId))
    }

    if (params.scheduleConfig !== undefined) {
      // Validate schedule configuration
      const validation = validateScheduleConfig(params.scheduleConfig)
      if (!validation.isValid) {
        throw ErrorFactories.validationFailed(
          validation.errors.map(error => ({ field: 'scheduleConfig', message: error }))
        )
      }

      updates.push('schedule_config = :scheduleConfig')
      parameters.push(createParameter('scheduleConfig', JSON.stringify(params.scheduleConfig)))
    }

    if (params.inputData !== undefined) {
      updates.push('input_data = :inputData')
      parameters.push(createParameter('inputData', JSON.stringify(params.inputData)))
    }

    if (params.active !== undefined) {
      updates.push('active = :active')
      parameters.push(createParameter('active', params.active))
    }

    if (updates.length === 0) {
      throw ErrorFactories.validationFailed([{ field: 'general', message: 'No fields to update' }])
    }

    // Add updated_at and updated_by
    updates.push('updated_at = NOW()', 'updated_by = :updatedBy')

    // Execute update
    const updateResult = await executeSQL<any>(`
      UPDATE scheduled_executions
      SET ${updates.join(', ')}
      WHERE id = :id AND user_id = :userId
      RETURNING id, name, user_id, assistant_architect_id, schedule_config, input_data, active, created_at, updated_at
    `, parameters)

    if (!updateResult || updateResult.length === 0) {
      throw ErrorFactories.dbQueryFailed("UPDATE scheduled_executions", new Error("Failed to update schedule"))
    }

    // Transform and return updated schedule
    const updated = transformSnakeToCamel<any>(updateResult[0])

    let scheduleConfig: ScheduleConfig
    let inputData: Record<string, any>

    try {
      scheduleConfig = typeof updated.scheduleConfig === 'string'
        ? JSON.parse(updated.scheduleConfig)
        : updated.scheduleConfig
    } catch {
      scheduleConfig = { frequency: 'daily', time: '09:00' }
    }

    try {
      inputData = typeof updated.inputData === 'string'
        ? JSON.parse(updated.inputData)
        : updated.inputData
    } catch {
      inputData = {}
    }

    const schedule: Schedule = {
      id: updated.id,
      name: updated.name,
      userId: updated.userId,
      assistantArchitectId: updated.assistantArchitectId,
      scheduleConfig,
      inputData,
      active: updated.active,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt
    }

    timer({ status: "success" })
    log.info("Schedule updated successfully", { scheduleId: id })

    return createSuccess(schedule, "Schedule updated successfully")

  } catch (error) {
    timer({ status: "error" })
    return handleError(error, "Failed to update schedule", {
      context: "updateScheduleAction",
      requestId,
      operation: "updateSchedule"
    })
  }
}

/**
 * Deletes a schedule
 */
export async function deleteScheduleAction(id: number): Promise<ActionState<{ success: boolean }>> {
  const requestId = generateRequestId()
  const timer = startTimer("deleteScheduleAction")
  const log = createLogger({ requestId, action: "deleteSchedule" })

  try {
    log.info("Deleting schedule", { id })

    // Auth check
    const session = await getServerSession()
    if (!session || !session.sub) {
      log.warn("Unauthorized")
      throw ErrorFactories.authNoSession()
    }

    // Check if user has access to assistant-architect tool
    const hasAccess = await hasToolAccess(session.sub, "assistant-architect")
    if (!hasAccess) {
      log.warn("User lacks assistant-architect access")
      throw ErrorFactories.authzInsufficientPermissions("assistant-architect")
    }

    // Get user ID from sub
    const userResult = await executeSQL<{ id: number }>(`
      SELECT id FROM users WHERE cognito_sub = :cognitoSub
    `, [createParameter('cognitoSub', session.sub)])

    if (!userResult || userResult.length === 0) {
      log.warn("User not found")
      throw ErrorFactories.authzResourceNotFound("user", session.sub)
    }

    const userId = userResult[0].id

    // Check if schedule exists and user owns it
    const existingResult = await executeSQL<{ id: number }>(`
      SELECT id FROM scheduled_executions
      WHERE id = :id AND user_id = :userId
    `, [
      createParameter('id', id),
      createParameter('userId', userId)
    ])

    if (!existingResult || existingResult.length === 0) {
      log.warn("Schedule not found or no access")
      throw ErrorFactories.authzResourceNotFound("schedule", id.toString())
    }

    // Delete the schedule (cascade will handle related records)
    const deleteResult = await executeSQL<{ id: number }>(`
      DELETE FROM scheduled_executions
      WHERE id = :id AND user_id = :userId
      RETURNING id
    `, [
      createParameter('id', id),
      createParameter('userId', userId)
    ])

    if (!deleteResult || deleteResult.length === 0) {
      throw ErrorFactories.dbQueryFailed("DELETE FROM scheduled_executions", new Error("Failed to delete schedule"))
    }

    timer({ status: "success" })
    log.info("Schedule deleted successfully", { scheduleId: id })

    return createSuccess({ success: true }, "Schedule deleted successfully")

  } catch (error) {
    timer({ status: "error" })
    return handleError(error, "Failed to delete schedule", {
      context: "deleteScheduleAction",
      requestId,
      operation: "deleteSchedule"
    })
  }
}

/**
 * Gets a single schedule by ID
 */
export async function getScheduleAction(id: number): Promise<ActionState<Schedule>> {
  const requestId = generateRequestId()
  const timer = startTimer("getScheduleAction")
  const log = createLogger({ requestId, action: "getSchedule" })

  try {
    log.info("Getting schedule", { id })

    // Auth check
    const session = await getServerSession()
    if (!session || !session.sub) {
      log.warn("Unauthorized")
      throw ErrorFactories.authNoSession()
    }

    // Check if user has access to assistant-architect tool
    const hasAccess = await hasToolAccess(session.sub, "assistant-architect")
    if (!hasAccess) {
      log.warn("User lacks assistant-architect access")
      throw ErrorFactories.authzInsufficientPermissions("assistant-architect")
    }

    // Get user ID from sub
    const userResult = await executeSQL<{ id: number }>(`
      SELECT id FROM users WHERE cognito_sub = :cognitoSub
    `, [createParameter('cognitoSub', session.sub)])

    if (!userResult || userResult.length === 0) {
      log.warn("User not found")
      throw ErrorFactories.authzResourceNotFound("user", session.sub)
    }

    const userId = userResult[0].id

    // Get schedule with last execution info
    const result = await executeSQL<any>(`
      SELECT
        se.id,
        se.name,
        se.user_id,
        se.assistant_architect_id,
        se.schedule_config,
        se.input_data,
        se.active,
        se.created_at,
        se.updated_at,
        er.executed_at as last_executed_at,
        er.status as last_execution_status
      FROM scheduled_executions se
      LEFT JOIN LATERAL (
        SELECT executed_at, status
        FROM execution_results
        WHERE scheduled_execution_id = se.id
        ORDER BY executed_at DESC
        LIMIT 1
      ) er ON true
      WHERE se.id = :id AND se.user_id = :userId
    `, [
      createParameter('id', id),
      createParameter('userId', userId)
    ])

    if (!result || result.length === 0) {
      log.warn("Schedule not found or no access")
      throw ErrorFactories.authzResourceNotFound("schedule", id.toString())
    }

    // Transform result
    const row = result[0]
    const transformed = transformSnakeToCamel<any>(row)

    // Parse JSONB fields
    let scheduleConfig: ScheduleConfig
    let inputData: Record<string, any>

    try {
      scheduleConfig = typeof transformed.scheduleConfig === 'string'
        ? JSON.parse(transformed.scheduleConfig)
        : transformed.scheduleConfig
    } catch {
      scheduleConfig = { frequency: 'daily', time: '09:00' }
    }

    try {
      inputData = typeof transformed.inputData === 'string'
        ? JSON.parse(transformed.inputData)
        : transformed.inputData
    } catch {
      inputData = {}
    }

    const schedule: Schedule = {
      id: transformed.id,
      name: transformed.name,
      userId: transformed.userId,
      assistantArchitectId: transformed.assistantArchitectId,
      scheduleConfig,
      inputData,
      active: transformed.active,
      createdAt: transformed.createdAt,
      updatedAt: transformed.updatedAt
    }

    // Add last execution info if available
    if (transformed.lastExecutedAt && transformed.lastExecutionStatus) {
      schedule.lastExecution = {
        executedAt: transformed.lastExecutedAt,
        status: transformed.lastExecutionStatus
      }
    }

    timer({ status: "success" })
    log.info("Schedule retrieved successfully", { scheduleId: id })

    return createSuccess(schedule, "Schedule retrieved successfully")

  } catch (error) {
    timer({ status: "error" })
    return handleError(error, "Failed to get schedule", {
      context: "getScheduleAction",
      requestId,
      operation: "getSchedule"
    })
  }
}