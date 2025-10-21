"use server"

import { getServerSession } from "@/lib/auth/server-session"
import { executeSQL } from "@/lib/db/data-api-adapter"
import { transformSnakeToCamel } from "@/lib/db/field-mapper"
import { type ActionState } from "@/types/actions-types"
import {
  handleError,
  ErrorFactories,
  createSuccess
} from "@/lib/error-utils"
import {
  createLogger,
  generateRequestId,
  startTimer
} from "@/lib/logger"
import {
  canAccessPromptLibrary,
  getUserIdFromSession
} from "@/lib/prompt-library/access-control"
import type { PromptTag } from "@/lib/prompt-library/types"

/**
 * Get all available tags
 */
export async function getAllTags(): Promise<ActionState<PromptTag[]>> {
  const requestId = generateRequestId()
  const timer = startTimer("getAllTags")
  const log = createLogger({ requestId, action: "getAllTags" })

  try {
    log.info("Action started: Getting all tags")

    // Auth check
    const session = await getServerSession()
    if (!session) {
      log.warn("Unauthorized tags access")
      throw ErrorFactories.authNoSession()
    }

    const userId = await getUserIdFromSession(session.sub)

    // Check access
    const hasAccess = await canAccessPromptLibrary(userId)
    if (!hasAccess) {
      log.warn("Tags access denied - insufficient permissions", { userId })
      throw ErrorFactories.authzToolAccessDenied("knowledge-repositories")
    }

    // Get all tags with usage count
    const results = await executeSQL<{
      id: number
      name: string
      created_at: Date
      usage_count: number
    }>(
      `SELECT
         t.id,
         t.name,
         t.created_at,
         COUNT(plt.prompt_id) as usage_count
       FROM prompt_tags t
       LEFT JOIN prompt_library_tags plt ON t.id = plt.tag_id
       GROUP BY t.id, t.name, t.created_at
       ORDER BY usage_count DESC, t.name ASC`,
      []
    )

    const tags = results.map(r => transformSnakeToCamel<PromptTag>(r))

    timer({ status: "success" })
    log.info("Tags retrieved successfully", { count: tags.length })

    return createSuccess(tags)
  } catch (error) {
    timer({ status: "error" })
    return handleError(error, "Failed to retrieve tags", {
      context: "getAllTags",
      requestId,
      operation: "getAllTags"
    })
  }
}

/**
 * Get popular tags
 */
export async function getPopularTags(
  limit: number = 20
): Promise<ActionState<Array<PromptTag & { usageCount: number }>>> {
  const requestId = generateRequestId()
  const timer = startTimer("getPopularTags")
  const log = createLogger({ requestId, action: "getPopularTags" })

  try {
    // Validate and clamp limit to prevent abuse
    const validatedLimit = Math.max(1, Math.min(limit, 100))

    log.info("Action started: Getting popular tags", { limit: validatedLimit })

    // Auth check
    const session = await getServerSession()
    if (!session) {
      log.warn("Unauthorized popular tags access")
      throw ErrorFactories.authNoSession()
    }

    const userId = await getUserIdFromSession(session.sub)

    // Check access
    const hasAccess = await canAccessPromptLibrary(userId)
    if (!hasAccess) {
      log.warn("Popular tags access denied - insufficient permissions", {
        userId
      })
      throw ErrorFactories.authzToolAccessDenied("knowledge-repositories")
    }

    // Get popular tags
    const results = await executeSQL<{
      id: number
      name: string
      created_at: Date
      usage_count: number
    }>(
      `SELECT
         t.id,
         t.name,
         t.created_at,
         COUNT(plt.prompt_id) as usage_count
       FROM prompt_tags t
       INNER JOIN prompt_library_tags plt ON t.id = plt.tag_id
       INNER JOIN prompt_library p ON plt.prompt_id = p.id
       WHERE p.deleted_at IS NULL
       GROUP BY t.id, t.name, t.created_at
       HAVING COUNT(plt.prompt_id) > 0
       ORDER BY usage_count DESC, t.name ASC
       LIMIT :limit`,
      [{ name: "limit", value: { longValue: validatedLimit } }]
    )

    const tags = results.map(r => transformSnakeToCamel<PromptTag & { usageCount: number }>(r))

    timer({ status: "success" })
    log.info("Popular tags retrieved successfully", { count: tags.length })

    return createSuccess(tags)
  } catch (error) {
    timer({ status: "error" })
    return handleError(error, "Failed to retrieve popular tags", {
      context: "getPopularTags",
      requestId,
      operation: "getPopularTags"
    })
  }
}

/**
 * Get tags for a specific prompt
 */
export async function getPromptTags(
  promptId: string
): Promise<ActionState<PromptTag[]>> {
  const requestId = generateRequestId()
  const timer = startTimer("getPromptTags")
  const log = createLogger({ requestId, action: "getPromptTags" })

  try {
    log.info("Action started: Getting prompt tags", { promptId })

    // Auth check
    const session = await getServerSession()
    if (!session) {
      log.warn("Unauthorized prompt tags access")
      throw ErrorFactories.authNoSession()
    }

    const userId = await getUserIdFromSession(session.sub)

    // Check access
    const hasAccess = await canAccessPromptLibrary(userId)
    if (!hasAccess) {
      log.warn("Prompt tags access denied - insufficient permissions", {
        userId
      })
      throw ErrorFactories.authzToolAccessDenied("knowledge-repositories")
    }

    // Get tags for prompt
    const results = await executeSQL<{
      id: number
      name: string
      created_at: Date
    }>(
      `SELECT t.id, t.name, t.created_at
       FROM prompt_tags t
       INNER JOIN prompt_library_tags plt ON t.id = plt.tag_id
       WHERE plt.prompt_id = :promptId
       ORDER BY t.name ASC`,
      [{ name: "promptId", value: { stringValue: promptId } }]
    )

    const tags = results.map(r => transformSnakeToCamel<PromptTag>(r))

    timer({ status: "success" })
    log.info("Prompt tags retrieved successfully", {
      promptId,
      count: tags.length
    })

    return createSuccess(tags)
  } catch (error) {
    timer({ status: "error" })
    return handleError(error, "Failed to retrieve prompt tags", {
      context: "getPromptTags",
      requestId,
      operation: "getPromptTags",
      metadata: { promptId }
    })
  }
}

/**
 * Search tags by name
 */
export async function searchTags(
  query: string,
  limit: number = 10
): Promise<ActionState<PromptTag[]>> {
  const requestId = generateRequestId()
  const timer = startTimer("searchTags")
  const log = createLogger({ requestId, action: "searchTags" })

  try {
    // Validate and clamp limit to prevent abuse
    const validatedLimit = Math.max(1, Math.min(limit, 100))

    log.info("Action started: Searching tags", { query, limit: validatedLimit })

    // Auth check
    const session = await getServerSession()
    if (!session) {
      log.warn("Unauthorized tag search")
      throw ErrorFactories.authNoSession()
    }

    const userId = await getUserIdFromSession(session.sub)

    // Check access
    const hasAccess = await canAccessPromptLibrary(userId)
    if (!hasAccess) {
      log.warn("Tag search denied - insufficient permissions", { userId })
      throw ErrorFactories.authzToolAccessDenied("knowledge-repositories")
    }

    // Search tags
    const results = await executeSQL<{
      id: number
      name: string
      created_at: Date
    }>(
      `SELECT id, name, created_at
       FROM prompt_tags
       WHERE name ILIKE :query
       ORDER BY name ASC
       LIMIT :limit`,
      [
        { name: "query", value: { stringValue: `%${query}%` } },
        { name: "limit", value: { longValue: validatedLimit } }
      ]
    )

    const tags = results.map(r => transformSnakeToCamel<PromptTag>(r))

    timer({ status: "success" })
    log.info("Tag search completed", { count: tags.length })

    return createSuccess(tags)
  } catch (error) {
    timer({ status: "error" })
    return handleError(error, "Failed to search tags", {
      context: "searchTags",
      requestId,
      operation: "searchTags",
      metadata: { query }
    })
  }
}
