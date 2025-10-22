"use server"

import { createLogger, generateRequestId, startTimer, sanitizeForLogging } from "@/lib/logger"
import { handleError, ErrorFactories, createSuccess } from "@/lib/error-utils"
import { getServerSession } from "@/lib/auth/server-session"
import { hasRole } from "@/utils/roles"
import { executeSQL, createParameter } from "@/lib/db/data-api-adapter"
import { transformSnakeToCamel } from "@/lib/db/field-mapper"
import type { ActionState } from "@/types/actions-types"

export interface ModerationQueueItem {
  id: string
  userId: number
  title: string
  content: string
  description: string | null
  visibility: string
  moderationStatus: string
  createdAt: string
  updatedAt: string
  creatorFirstName: string
  creatorLastName: string
  creatorEmail: string
  viewCount: number
  useCount: number
  tags: string[]
}

export interface ModerationAction {
  status: 'approved' | 'rejected'
  notes?: string
}

/**
 * Get the moderation queue with filtering options
 */
export async function getModerationQueue(
  filters: {
    status?: string
    limit?: number
    offset?: number
  } = {}
): Promise<ActionState<{ items: ModerationQueueItem[]; total: number }>> {
  const requestId = generateRequestId()
  const timer = startTimer("getModerationQueue")
  const log = createLogger({ requestId, action: "getModerationQueue" })

  try {
    log.info("Fetching moderation queue", { filters: sanitizeForLogging(filters) })

    const session = await getServerSession()
    if (!session) {
      log.warn("Unauthorized access attempt")
      throw ErrorFactories.authNoSession()
    }

    const isAdmin = await hasRole('administrator')
    if (!isAdmin) {
      log.warn("Non-admin user attempted to access moderation queue", { userId: (session.user as { id: number }).id })
      throw ErrorFactories.authzAdminRequired("access moderation queue")
    }

    const { status = 'pending', limit = 50, offset = 0 } = filters

    // Build the query
    const whereClause = status === 'all' ? '' : 'WHERE p.moderation_status = :status'

    const query = `
      SELECT
        p.id,
        p.user_id,
        p.title,
        p.content,
        p.description,
        p.visibility,
        p.moderation_status,
        p.created_at,
        p.updated_at,
        p.view_count,
        p.use_count,
        u.first_name as creator_first_name,
        u.last_name as creator_last_name,
        u.email as creator_email,
        COALESCE(
          ARRAY_AGG(DISTINCT pt.name) FILTER (WHERE pt.name IS NOT NULL),
          ARRAY[]::VARCHAR[]
        ) as tags
      FROM prompt_library p
      JOIN users u ON p.user_id = u.id
      LEFT JOIN prompt_library_tags plt ON p.id = plt.prompt_id
      LEFT JOIN prompt_tags pt ON plt.tag_id = pt.id
      ${whereClause}
      AND p.deleted_at IS NULL
      GROUP BY p.id, u.id, u.first_name, u.last_name, u.email
      ORDER BY p.created_at DESC
      LIMIT :limit OFFSET :offset
    `

    const countQuery = `
      SELECT COUNT(*) as total
      FROM prompt_library p
      ${whereClause}
      AND p.deleted_at IS NULL
    `

    const queryParams = status === 'all'
      ? [
          createParameter('limit', limit),
          createParameter('offset', offset)
        ]
      : [
          createParameter('status', status),
          createParameter('limit', limit),
          createParameter('offset', offset)
        ]

    const countParams = status === 'all'
      ? []
      : [createParameter('status', status)]

    const [itemsResult, countResult] = await Promise.all([
      executeSQL(query, queryParams),
      executeSQL(countQuery, countParams)
    ])

    const items = itemsResult.map((row: Record<string, unknown>) => transformSnakeToCamel<ModerationQueueItem>(row))
    const total = Number(countResult[0]?.total || 0)

    timer({ status: "success" })
    log.info("Moderation queue fetched successfully", { count: items.length, total })

    return createSuccess({ items, total }, "Queue fetched successfully")

  } catch (error) {
    timer({ status: "error" })
    return handleError(error, "Failed to fetch moderation queue", {
      context: "getModerationQueue",
      requestId,
      operation: "getModerationQueue"
    })
  }
}

/**
 * Moderate a single prompt (approve or reject)
 */
export async function moderatePrompt(
  promptId: string,
  action: ModerationAction
): Promise<ActionState<{ success: boolean }>> {
  const requestId = generateRequestId()
  const timer = startTimer("moderatePrompt")
  const log = createLogger({ requestId, action: "moderatePrompt" })

  try {
    log.info("Moderating prompt", { promptId, action: sanitizeForLogging(action) })

    const session = await getServerSession()
    if (!session) {
      log.warn("Unauthorized moderation attempt")
      throw ErrorFactories.authNoSession()
    }

    const isAdmin = await hasRole('administrator')
    if (!isAdmin) {
      log.warn("Non-admin user attempted to moderate prompt", { userId: (session.user as { id: number }).id })
      throw ErrorFactories.authzAdminRequired("moderate prompts")
    }

    const query = `
      UPDATE prompt_library
      SET
        moderation_status = :status,
        moderated_by = :moderatedBy,
        moderated_at = CURRENT_TIMESTAMP,
        moderation_notes = :notes,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = :promptId
      AND deleted_at IS NULL
    `

    await executeSQL(query, [
      createParameter('status', action.status),
      createParameter('moderatedBy', (session.user as { id: number }).id),
      createParameter('notes', action.notes || ''),
      createParameter('promptId', promptId)
    ])

    timer({ status: "success" })
    log.info("Prompt moderated successfully", { promptId, status: action.status })

    return createSuccess(
      { success: true },
      `Prompt ${action.status} successfully`
    )

  } catch (error) {
    timer({ status: "error" })
    return handleError(error, "Failed to moderate prompt", {
      context: "moderatePrompt",
      requestId,
      operation: "moderatePrompt"
    })
  }
}

/**
 * Bulk moderate multiple prompts
 */
export async function bulkModeratePrompts(
  promptIds: string[],
  action: ModerationAction
): Promise<ActionState<{ success: boolean; count: number }>> {
  const requestId = generateRequestId()
  const timer = startTimer("bulkModeratePrompts")
  const log = createLogger({ requestId, action: "bulkModeratePrompts" })

  try {
    log.info("Bulk moderating prompts", { count: promptIds.length, action: sanitizeForLogging(action) })

    const session = await getServerSession()
    if (!session) {
      log.warn("Unauthorized bulk moderation attempt")
      throw ErrorFactories.authNoSession()
    }

    const isAdmin = await hasRole('administrator')
    if (!isAdmin) {
      log.warn("Non-admin user attempted bulk moderation", { userId: (session.user as { id: number }).id })
      throw ErrorFactories.authzAdminRequired("bulk moderate prompts")
    }

    if (promptIds.length === 0) {
      throw ErrorFactories.missingRequiredField("promptIds")
    }

    if (promptIds.length > 100) {
      throw ErrorFactories.invalidInput("promptIds", promptIds.length, "Maximum 100 prompts")
    }

    // Build the IN clause for the query
    const placeholders = promptIds.map((_, i) => `:id${i}`).join(', ')
    const params = [
      createParameter('status', action.status),
      createParameter('moderatedBy', (session.user as { id: number }).id),
      createParameter('notes', action.notes || ''),
      ...promptIds.map((id, i) => createParameter(`id${i}`, id))
    ]

    const query = `
      UPDATE prompt_library
      SET
        moderation_status = :status,
        moderated_by = :moderatedBy,
        moderated_at = CURRENT_TIMESTAMP,
        moderation_notes = :notes,
        updated_at = CURRENT_TIMESTAMP
      WHERE id IN (${placeholders})
      AND deleted_at IS NULL
    `

    await executeSQL(query, params)

    timer({ status: "success" })
    log.info("Bulk moderation completed", { count: promptIds.length, status: action.status })

    return createSuccess(
      { success: true, count: promptIds.length },
      `Successfully ${action.status} ${promptIds.length} prompts`
    )

  } catch (error) {
    timer({ status: "error" })
    return handleError(error, "Failed to bulk moderate prompts", {
      context: "bulkModeratePrompts",
      requestId,
      operation: "bulkModeratePrompts"
    })
  }
}

/**
 * Get moderation statistics
 */
export async function getModerationStats(): Promise<ActionState<{
  pending: number
  approved: number
  rejected: number
  totalToday: number
}>> {
  const requestId = generateRequestId()
  const timer = startTimer("getModerationStats")
  const log = createLogger({ requestId, action: "getModerationStats" })

  try {
    log.info("Fetching moderation statistics")

    const session = await getServerSession()
    if (!session) {
      throw ErrorFactories.authNoSession()
    }

    const isAdmin = await hasRole('administrator')
    if (!isAdmin) {
      throw ErrorFactories.authzAdminRequired("view moderation statistics")
    }

    const query = `
      SELECT
        COUNT(*) FILTER (WHERE moderation_status = 'pending') as pending,
        COUNT(*) FILTER (WHERE moderation_status = 'approved') as approved,
        COUNT(*) FILTER (WHERE moderation_status = 'rejected') as rejected,
        COUNT(*) FILTER (WHERE moderated_at >= CURRENT_DATE) as total_today
      FROM prompt_library
      WHERE deleted_at IS NULL
    `

    const result = await executeSQL(query, [])
    const rawStats = result[0] as Record<string, unknown>
    const stats = {
      pending: Number(rawStats.pending || 0),
      approved: Number(rawStats.approved || 0),
      rejected: Number(rawStats.rejected || 0),
      totalToday: Number(rawStats.total_today || 0)
    }

    timer({ status: "success" })
    log.info("Stats fetched successfully", stats)

    return createSuccess(stats, "Statistics fetched successfully")

  } catch (error) {
    timer({ status: "error" })
    return handleError(error, "Failed to fetch moderation statistics", {
      context: "getModerationStats",
      requestId,
      operation: "getModerationStats"
    })
  }
}
