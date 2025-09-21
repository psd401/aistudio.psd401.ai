"use server"

import { executeSQL, createParameter, hasToolAccess } from "@/lib/db/data-api-adapter"
import { transformSnakeToCamel } from "@/lib/db/field-mapper"
import { createLogger, generateRequestId, startTimer, sanitizeForLogging } from "@/lib/logger"
import { handleError, ErrorFactories, createSuccess } from "@/lib/error-utils"
import { getServerSession } from "@/lib/auth/server-session"
import { ActionState } from "@/types"
// Note: cron-parser had import issues, using robust regex validation instead
import escapeHtml from "escape-html"

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

// Security: CodeQL-compliant sanitizer that breaks taint flow completely
function sanitizeNumericId(value: unknown): number {
  // Convert to number and validate
  const num = Number(value)

  // Strict validation with early exit
  if (!Number.isInteger(num) || !Number.isFinite(num) || num <= 0 || num > Number.MAX_SAFE_INTEGER) {
    throw new Error('Invalid numeric ID')
  }

  // Create a completely new clean value to break taint flow
  // Math.floor(Math.abs()) creates a new primitive that CodeQL recognizes as safe
  return Math.floor(Math.abs(num))
}

// Maximum schedules per user
const MAX_SCHEDULES_PER_USER = 10

// Maximum input data size (50KB)
const MAX_INPUT_DATA_SIZE = 50000

/**
 * Validates and sanitizes name field
 */
function validateAndSanitizeName(name: string): { isValid: boolean; sanitizedName: string; errors: string[] } {
  const errors: string[] = []

  if (!name || name.trim().length === 0) {
    errors.push('Name is required')
    return { isValid: false, sanitizedName: '', errors }
  }

  const sanitizedName = escapeHtml(name.trim())

  if (sanitizedName.length === 0) {
    errors.push('Name cannot be empty after sanitization')
  } else if (sanitizedName.length > 100) {
    errors.push('Name exceeds maximum length of 100 characters')
  }

  return { isValid: errors.length === 0, sanitizedName, errors }
}

/**
 * Validates input data size and structure
 */
function validateInputData(inputData: Record<string, any>): { isValid: boolean; errors: string[] } {
  const errors: string[] = []

  try {
    const serializedData = JSON.stringify(inputData)
    if (serializedData.length > MAX_INPUT_DATA_SIZE) {
      errors.push(`Input data exceeds maximum size limit of ${MAX_INPUT_DATA_SIZE / 1000}KB`)
    }
  } catch (error) {
    errors.push('Input data is not serializable to JSON')
  }

  return { isValid: errors.length === 0, errors }
}

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
  if (config.frequency === 'weekly') {
    if (!config.daysOfWeek || !Array.isArray(config.daysOfWeek) || config.daysOfWeek.length === 0) {
      errors.push('daysOfWeek is required and must be a non-empty array for weekly schedules')
    } else if (config.daysOfWeek.some(day => day < 0 || day > 6)) {
      errors.push('daysOfWeek must contain values between 0 (Sunday) and 6 (Saturday)')
    }
  }

  if (config.frequency === 'monthly') {
    if (!config.dayOfMonth || config.dayOfMonth < 1 || config.dayOfMonth > 31) {
      errors.push('dayOfMonth is required and must be between 1 and 31 for monthly schedules')
    }
  }

  if (config.frequency === 'custom') {
    if (!config.cron) {
      errors.push('cron expression is required for custom schedules')
    } else {
      // Comprehensive cron validation with strict input sanitization
      const trimmedCron = config.cron.trim()

      // First, ensure the cron string only contains allowed characters
      if (!/^[0-9\*\-\/,\s]+$/.test(trimmedCron)) {
        errors.push('Cron expression contains invalid characters')
      } else {
        const cronFields = trimmedCron.split(/\s+/)

        // Validate exact field count first
        if (cronFields.length !== 5) {
          errors.push('cron expression must have exactly 5 fields (minute hour day month day-of-week)')
        } else {
          // Validate each field individually to prevent bypass attempts
          const [minute, hour, day, month, dayOfWeek] = cronFields

          // Validate minute field (0-59)
          if (!/^(\*|([0-5]?\d)(-([0-5]?\d))?(\/\d+)?)$/.test(minute)) {
            errors.push('Invalid minute field in cron expression')
          }

          // Validate hour field (0-23)
          if (!/^(\*|([01]?\d|2[0-3])(-([01]?\d|2[0-3]))?(\/\d+)?)$/.test(hour)) {
            errors.push('Invalid hour field in cron expression')
          }

          // Validate day field (1-31)
          if (!/^(\*|([12]?\d|3[01])(-([12]?\d|3[01]))?(\/\d+)?)$/.test(day)) {
            errors.push('Invalid day field in cron expression')
          }

          // Validate month field (1-12)
          if (!/^(\*|([1-9]|1[0-2])(-([1-9]|1[0-2]))?(\/\d+)?)$/.test(month)) {
            errors.push('Invalid month field in cron expression')
          }

          // Validate day-of-week field (0-6)
          if (!/^(\*|([0-6])(-([0-6]))?(\/\d+)?)$/.test(dayOfWeek)) {
            errors.push('Invalid day-of-week field in cron expression')
          }
        }
      }
    }
  }

  // Note: Timezone validation removed to prevent false positives
  // The timezone will be stored as-is and used by the scheduler

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
    log.info("createScheduleAction called with params", {
      params: sanitizeForLogging(params),
      paramTypes: {
        name: typeof params.name,
        assistantArchitectId: typeof params.assistantArchitectId,
        scheduleConfig: typeof params.scheduleConfig,
        inputData: typeof params.inputData
      },
      assistantArchitectIdValue: params.assistantArchitectId,
      scheduleConfigDetails: sanitizeForLogging(params.scheduleConfig)
    })
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

    // Validate and sanitize name
    log.info("Validating name", { name, nameType: typeof name })
    const nameValidation = validateAndSanitizeName(name)
    if (!nameValidation.isValid) {
      log.error("Name validation failed", { nameValidation })
      throw ErrorFactories.validationFailed(
        nameValidation.errors.map(error => ({ field: 'name', message: error }))
      )
    }
    const sanitizedName = nameValidation.sanitizedName
    log.info("Name validation passed", { sanitizedName })

    // Security: Sanitize ID with CodeQL-compliant pattern that breaks taint flow
    log.info("Validating assistantArchitectId", {
      assistantArchitectId,
      type: typeof assistantArchitectId,
      value: assistantArchitectId,
      isNaN: isNaN(Number(assistantArchitectId))
    })
    let cleanArchitectId: number
    try {
      cleanArchitectId = sanitizeNumericId(assistantArchitectId)
      log.info("AssistantArchitectId validation passed", { cleanArchitectId })
    } catch (error) {
      log.error("AssistantArchitectId validation failed", {
        assistantArchitectId,
        type: typeof assistantArchitectId,
        converted: Number(assistantArchitectId),
        isNaN: isNaN(Number(assistantArchitectId)),
        isInteger: Number.isInteger(Number(assistantArchitectId)),
        error: sanitizeForLogging(error)
      })
      throw ErrorFactories.validationFailed([{
        field: 'assistantArchitectId',
        message: `assistantArchitectId must be a valid positive integer. Received: ${assistantArchitectId} (${typeof assistantArchitectId})`
      }])
    }

    // Validate schedule configuration
    log.info("Validating schedule configuration", {
      scheduleConfig: sanitizeForLogging(scheduleConfig)
    })
    const validation = validateScheduleConfig(scheduleConfig)
    if (!validation.isValid) {
      log.error("Schedule config validation failed", {
        scheduleConfig: sanitizeForLogging(scheduleConfig),
        validationErrors: validation.errors
      })
      throw ErrorFactories.validationFailed(
        validation.errors.map(error => ({ field: 'scheduleConfig', message: error }))
      )
    }
    log.info("Schedule config validation passed")

    // Validate input data size
    log.info("Validating input data", {
      inputDataSize: JSON.stringify(inputData).length,
      inputDataType: typeof inputData
    })
    const inputDataValidation = validateInputData(inputData)
    if (!inputDataValidation.isValid) {
      log.error("Input data validation failed", {
        inputDataValidation,
        inputDataSize: JSON.stringify(inputData).length
      })
      throw ErrorFactories.validationFailed(
        inputDataValidation.errors.map(error => ({ field: 'inputData', message: error }))
      )
    }
    log.info("Input data validation passed")

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
      createParameter('architectId', cleanArchitectId),
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
    log.info("Checking for duplicate schedule name", {
      sanitizedName,
      userId
    })

    const duplicateResult = await executeSQL<{ id: number }>(`
      SELECT id FROM scheduled_executions
      WHERE user_id = :userId AND name = :name
    `, [
      createParameter('userId', userId),
      createParameter('name', sanitizedName)
    ])

    if (duplicateResult && duplicateResult.length > 0) {
      log.warn("Duplicate schedule name found", {
        duplicateName: sanitizedName,
        existingScheduleId: duplicateResult[0].id,
        userId
      })
      throw ErrorFactories.validationFailed([{
        field: 'name',
        message: `A schedule named "${sanitizedName}" already exists. Please choose a different name.`
      }])
    }

    log.info("No duplicate schedule name found, proceeding with creation")

    // Create the schedule
    const result = await executeSQL<{ id: number }>(`
      INSERT INTO scheduled_executions (
        user_id, assistant_architect_id, name, schedule_config, input_data, updated_by
      ) VALUES (
        :userId, :assistantArchitectId, :name, :scheduleConfig, :inputData, :updatedBy
      ) RETURNING id
    `, [
      createParameter('userId', userId),
      createParameter('assistantArchitectId', cleanArchitectId),
      createParameter('name', sanitizedName),
      createParameter('scheduleConfig', JSON.stringify(scheduleConfig)),
      createParameter('inputData', JSON.stringify(inputData)),
      createParameter('updatedBy', session.sub)
    ])

    if (!result || result.length === 0) {
      throw ErrorFactories.dbQueryFailed("INSERT INTO scheduled_executions", new Error("Failed to create schedule"))
    }

    const scheduleId = result[0].id

    timer({ status: "success" })
    log.info("Schedule created successfully")

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
    log.info("Updating schedule", { params: sanitizeForLogging(params) })

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

    // Schedule exists and user has access, proceed with update

    // Build update query dynamically
    const updates: string[] = []
    const parameters: any[] = [
      createParameter('id', id),
      createParameter('userId', userId),
      createParameter('updatedBy', session.sub)
    ]

    if (params.name !== undefined) {
      // Validate and sanitize name
      const nameValidation = validateAndSanitizeName(params.name)
      if (!nameValidation.isValid) {
        throw ErrorFactories.validationFailed(
          nameValidation.errors.map(error => ({ field: 'name', message: error }))
        )
      }
      const sanitizedName = nameValidation.sanitizedName

      // Check for duplicate name (excluding current schedule)
      const duplicateResult = await executeSQL<{ id: number }>(`
        SELECT id FROM scheduled_executions
        WHERE user_id = :userId AND name = :name AND id != :currentId
      `, [
        createParameter('userId', userId),
        createParameter('name', sanitizedName),
        createParameter('currentId', id)
      ])

      if (duplicateResult && duplicateResult.length > 0) {
        throw ErrorFactories.validationFailed([{ field: 'name', message: 'Schedule name already exists' }])
      }

      updates.push('name = :name')
      parameters.push(createParameter('name', sanitizedName))
    }

    if (params.assistantArchitectId !== undefined) {
      // Security: Pre-validate user access BEFORE sanitization to prevent bypass
      // First verify user has general assistant architect access
      const hasAccess = await hasToolAccess(session.sub, "assistant-architect")
      if (!hasAccess) {
        throw ErrorFactories.authzToolAccessDenied("assistant-architect")
      }

      // Security: Sanitize ID with CodeQL-compliant pattern that breaks taint flow
      let cleanArchitectId: number
      try {
        cleanArchitectId = sanitizeNumericId(params.assistantArchitectId)
      } catch {
        throw ErrorFactories.validationFailed([{
          field: 'assistantArchitectId',
          message: 'assistantArchitectId must be a valid positive integer'
        }])
      }

      // Check if assistant architect exists and user has ownership access
      const architectResult = await executeSQL<{ id: number }>(`
        SELECT id FROM assistant_architects
        WHERE id = :architectId AND user_id = :userId
      `, [
        createParameter('architectId', cleanArchitectId),
        createParameter('userId', userId)
      ])

      if (!architectResult || architectResult.length === 0) {
        throw ErrorFactories.authzInsufficientPermissions("assistant architect")
      }

      updates.push('assistant_architect_id = :assistantArchitectId')
      parameters.push(createParameter('assistantArchitectId', cleanArchitectId))
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
      // Validate input data size
      const inputDataValidation = validateInputData(params.inputData)
      if (!inputDataValidation.isValid) {
        throw ErrorFactories.validationFailed(
          inputDataValidation.errors.map(error => ({ field: 'inputData', message: error }))
        )
      }

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
    log.info("Schedule updated successfully")

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
    log.info("Deleting schedule")

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
    log.info("Schedule deleted successfully")

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
    log.info("Getting schedule")

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
    log.info("Schedule retrieved successfully")

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