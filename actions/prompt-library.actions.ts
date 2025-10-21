"use server"

import { getServerSession } from "@/lib/auth/server-session"
import { executeSQL, executeTransaction } from "@/lib/db/data-api-adapter"
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
  startTimer,
  sanitizeForLogging
} from "@/lib/logger"
import { revalidatePath } from "next/cache"
import {
  canAccessPromptLibrary,
  canReadPrompt,
  canUpdatePrompt,
  canDeletePrompt,
  getUserIdFromSession
} from "@/lib/prompt-library/access-control"
import {
  createPromptSchema,
  updatePromptSchema,
  promptSearchSchema,
  type CreatePromptInput,
  type UpdatePromptInput,
  type PromptSearchInput
} from "@/lib/prompt-library/validation"
import type {
  Prompt,
  PromptListItem,
  PromptListResult,
  PromptTag
} from "@/lib/prompt-library/types"

/**
 * Create a new prompt
 */
export async function createPrompt(
  input: CreatePromptInput
): Promise<ActionState<Prompt>> {
  const requestId = generateRequestId()
  const timer = startTimer("createPrompt")
  const log = createLogger({ requestId, action: "createPrompt" })

  try {
    log.info("Action started: Creating prompt", {
      title: sanitizeForLogging(input.title)
    })

    // Auth check
    const session = await getServerSession()
    if (!session) {
      log.warn("Unauthorized prompt creation attempt")
      throw ErrorFactories.authNoSession()
    }

    // Get user ID
    const userId = await getUserIdFromSession(session.sub)
    log.debug("User ID retrieved", { userId })

    // Check access
    const hasAccess = await canAccessPromptLibrary(userId)
    if (!hasAccess) {
      log.warn("Prompt creation denied - insufficient permissions", {
        userId
      })
      throw ErrorFactories.authzToolAccessDenied("knowledge-repositories")
    }

    // Validate input
    const validated = createPromptSchema.parse(input)

    log.info("Creating prompt in database", {
      visibility: validated.visibility,
      tagCount: validated.tags?.length || 0
    })

    // Create prompt
    const results = await executeSQL<Prompt>(
      `INSERT INTO prompt_library
       (user_id, title, content, description, visibility, source_message_id, source_conversation_id)
       VALUES (:userId, :title, :content, :description, :visibility, :sourceMessageId, :sourceConversationId)
       RETURNING *`,
      [
        { name: "userId", value: { longValue: userId } },
        { name: "title", value: { stringValue: validated.title } },
        { name: "content", value: { stringValue: validated.content } },
        {
          name: "description",
          value: validated.description
            ? { stringValue: validated.description }
            : { isNull: true }
        },
        { name: "visibility", value: { stringValue: validated.visibility } },
        {
          name: "sourceMessageId",
          value: validated.sourceMessageId
            ? { stringValue: validated.sourceMessageId }
            : { isNull: true }
        },
        {
          name: "sourceConversationId",
          value: validated.sourceConversationId
            ? { stringValue: validated.sourceConversationId }
            : { isNull: true }
        }
      ]
    )

    if (results.length === 0) {
      throw ErrorFactories.sysInternalError("Failed to create prompt")
    }

    const prompt = transformSnakeToCamel<Prompt>(results[0])

    // Handle tags if provided
    if (validated.tags && validated.tags.length > 0) {
      await assignTagsToPrompt(prompt.id, validated.tags, log)
      // Fetch tags to include in response
      const tagResults = await executeSQL<{ name: string }>(
        `SELECT t.name
         FROM prompt_tags t
         JOIN prompt_library_tags plt ON t.id = plt.tag_id
         WHERE plt.prompt_id = :promptId`,
        [{ name: "promptId", value: { stringValue: prompt.id } }]
      )
      prompt.tags = tagResults.map(t => t.name)
    }

    timer({ status: "success" })
    log.info("Prompt created successfully", { promptId: prompt.id })

    revalidatePath("/prompt-library")

    return createSuccess(prompt, "Prompt saved successfully")
  } catch (error) {
    timer({ status: "error" })
    return handleError(error, "Failed to create prompt", {
      context: "createPrompt",
      requestId,
      operation: "createPrompt"
    })
  }
}

/**
 * Get a single prompt by ID
 */
export async function getPrompt(id: string): Promise<ActionState<Prompt>> {
  const requestId = generateRequestId()
  const timer = startTimer("getPrompt")
  const log = createLogger({ requestId, action: "getPrompt" })

  try {
    log.info("Action started: Getting prompt", { promptId: id })

    // Auth check
    const session = await getServerSession()
    if (!session) {
      log.warn("Unauthorized prompt access attempt")
      throw ErrorFactories.authNoSession()
    }

    const userId = await getUserIdFromSession(session.sub)

    // Check read access
    const canRead = await canReadPrompt(id, userId)
    if (!canRead) {
      log.warn("Prompt access denied", { promptId: id, userId })
      throw ErrorFactories.authzResourceNotFound("Prompt", id)
    }

    // Get prompt with tags
    const results = await executeSQL<Prompt>(
      `SELECT p.*,
              array_agg(DISTINCT t.name) FILTER (WHERE t.id IS NOT NULL) as tags,
              u.full_name as owner_name
       FROM prompt_library p
       LEFT JOIN prompt_library_tags plt ON p.id = plt.prompt_id
       LEFT JOIN prompt_tags t ON plt.tag_id = t.id
       LEFT JOIN users u ON p.user_id = u.id
       WHERE p.id = :id AND p.deleted_at IS NULL
       GROUP BY p.id, u.full_name`,
      [{ name: "id", value: { stringValue: id } }]
    )

    if (results.length === 0) {
      throw ErrorFactories.dbRecordNotFound("prompt_library", id)
    }

    const prompt = transformSnakeToCamel<Prompt>(results[0])

    timer({ status: "success" })
    log.info("Prompt retrieved successfully", { promptId: id })

    return createSuccess(prompt)
  } catch (error) {
    timer({ status: "error" })
    return handleError(error, "Failed to retrieve prompt", {
      context: "getPrompt",
      requestId,
      operation: "getPrompt"
    })
  }
}

/**
 * List prompts with filtering and pagination
 */
export async function listPrompts(
  params: PromptSearchInput
): Promise<ActionState<PromptListResult>> {
  const requestId = generateRequestId()
  const timer = startTimer("listPrompts")
  const log = createLogger({ requestId, action: "listPrompts" })

  try {
    log.info("Action started: Listing prompts", {
      params: sanitizeForLogging(params)
    })

    // Auth check
    const session = await getServerSession()
    if (!session) {
      log.warn("Unauthorized prompt list attempt")
      throw ErrorFactories.authNoSession()
    }

    const userId = await getUserIdFromSession(session.sub)

    // Validate params
    const validated = promptSearchSchema.parse(params)

    // Build query conditions
    const conditions = ["p.deleted_at IS NULL"]
    const parameters: Array<{ name: string; value: any }> = []

    // Visibility filter
    if (validated.visibility === 'private') {
      conditions.push("p.user_id = :userId")
      parameters.push({ name: "userId", value: { longValue: userId } })
    } else if (validated.visibility === 'public') {
      conditions.push("p.visibility = 'public' AND p.moderation_status = 'approved'")
    } else {
      // Show user's own prompts OR approved public prompts
      conditions.push(
        "(p.user_id = :userId OR (p.visibility = 'public' AND p.moderation_status = 'approved'))"
      )
      parameters.push({ name: "userId", value: { longValue: userId } })
    }

    // Tag filter
    if (validated.tags && validated.tags.length > 0) {
      conditions.push(`
        EXISTS (
          SELECT 1 FROM prompt_library_tags plt
          JOIN prompt_tags t ON plt.tag_id = t.id
          WHERE plt.prompt_id = p.id
          AND t.name = ANY(:tags)
        )
      `)
      parameters.push({
        name: "tags",
        value: { arrayValue: { stringValues: validated.tags } }
      })
    }

    // Search filter
    if (validated.search) {
      conditions.push(`
        (p.title ILIKE :search
         OR p.description ILIKE :search
         OR p.content ILIKE :search)
      `)
      const searchPattern = `%${validated.search}%`
      parameters.push({
        name: "search",
        value: { stringValue: searchPattern }
      })
    }

    // User filter (for viewing specific user's prompts)
    if (validated.userId) {
      conditions.push("p.user_id = :filterUserId")
      parameters.push({
        name: "filterUserId",
        value: { longValue: validated.userId }
      })
    }

    // Sort order
    let orderBy = "p.created_at DESC"
    if (validated.sort === 'usage') {
      orderBy = "p.use_count DESC, p.created_at DESC"
    } else if (validated.sort === 'views') {
      orderBy = "p.view_count DESC, p.created_at DESC"
    }

    // Calculate offset
    const offset = (validated.page - 1) * validated.limit

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM prompt_library p
      WHERE ${conditions.join(" AND ")}
    `
    const countResults = await executeSQL<{ total: number }>(
      countQuery,
      parameters
    )
    const total = countResults[0]?.total || 0

    // Get prompts
    const query = `
      SELECT
        p.id,
        p.user_id,
        p.title,
        LEFT(p.content, 200) as preview,
        p.description,
        p.visibility,
        p.moderation_status,
        p.view_count,
        p.use_count,
        p.created_at,
        p.updated_at,
        array_agg(DISTINCT t.name) FILTER (WHERE t.id IS NOT NULL) as tags,
        u.full_name as owner_name
      FROM prompt_library p
      LEFT JOIN prompt_library_tags plt ON p.id = plt.prompt_id
      LEFT JOIN prompt_tags t ON plt.tag_id = t.id
      LEFT JOIN users u ON p.user_id = u.id
      WHERE ${conditions.join(" AND ")}
      GROUP BY p.id, u.full_name
      ORDER BY ${orderBy}
      LIMIT :limit OFFSET :offset
    `

    parameters.push(
      { name: "limit", value: { longValue: validated.limit } },
      { name: "offset", value: { longValue: offset } }
    )

    const results = await executeSQL<PromptListItem>(query, parameters)
    const prompts = results.map(r => transformSnakeToCamel<PromptListItem>(r))

    const hasMore = total > validated.page * validated.limit

    timer({ status: "success" })
    log.info("Prompts listed successfully", {
      count: prompts.length,
      total,
      page: validated.page
    })

    return createSuccess({
      prompts,
      total,
      page: validated.page,
      limit: validated.limit,
      hasMore
    })
  } catch (error) {
    timer({ status: "error" })
    return handleError(error, "Failed to list prompts", {
      context: "listPrompts",
      requestId,
      operation: "listPrompts"
    })
  }
}

/**
 * Update an existing prompt
 */
export async function updatePrompt(
  id: string,
  input: UpdatePromptInput
): Promise<ActionState<Prompt>> {
  const requestId = generateRequestId()
  const timer = startTimer("updatePrompt")
  const log = createLogger({ requestId, action: "updatePrompt" })

  try {
    log.info("Action started: Updating prompt", { promptId: id })

    // Auth check
    const session = await getServerSession()
    if (!session) {
      log.warn("Unauthorized prompt update attempt")
      throw ErrorFactories.authNoSession()
    }

    const userId = await getUserIdFromSession(session.sub)

    // Check update access
    const canUpdate = await canUpdatePrompt(id, userId)
    if (!canUpdate) {
      log.warn("Prompt update denied", { promptId: id, userId })
      throw ErrorFactories.authzOwnerRequired("update this prompt")
    }

    // Validate input
    const validated = updatePromptSchema.parse(input)

    // Build update fields
    const fields: string[] = []
    const parameters: Array<{ name: string; value: any }> = [
      { name: "id", value: { stringValue: id } }
    ]

    if (validated.title !== undefined) {
      fields.push("title = :title")
      parameters.push({ name: "title", value: { stringValue: validated.title } })
    }

    if (validated.content !== undefined) {
      fields.push("content = :content")
      parameters.push({
        name: "content",
        value: { stringValue: validated.content }
      })
    }

    if (validated.description !== undefined) {
      fields.push("description = :description")
      parameters.push({
        name: "description",
        value: validated.description
          ? { stringValue: validated.description }
          : { isNull: true }
      })
    }

    if (validated.visibility !== undefined) {
      fields.push("visibility = :visibility")
      parameters.push({
        name: "visibility",
        value: { stringValue: validated.visibility }
      })

      // Reset moderation status if changing to public
      if (validated.visibility === 'public') {
        fields.push("moderation_status = 'pending'")
        fields.push("moderated_by = NULL")
        fields.push("moderated_at = NULL")
        fields.push("moderation_notes = NULL")
      }
    }

    if (fields.length === 0 && !validated.tags) {
      return createSuccess(null as any, "No changes to update")
    }

    // Update prompt
    if (fields.length > 0) {
      fields.push("updated_at = CURRENT_TIMESTAMP")

      const updateQuery = `
        UPDATE prompt_library
        SET ${fields.join(", ")}
        WHERE id = :id AND deleted_at IS NULL
        RETURNING *
      `

      const results = await executeSQL<Prompt>(updateQuery, parameters)

      if (results.length === 0) {
        throw ErrorFactories.dbRecordNotFound("prompt_library", id)
      }
    }

    // Handle tag updates
    if (validated.tags !== undefined) {
      await updateTagsForPrompt(id, validated.tags, log)
    }

    // Fetch updated prompt with tags
    const getResult = await getPrompt(id)
    if (!getResult.isSuccess) {
      throw new Error("Failed to fetch updated prompt")
    }

    timer({ status: "success" })
    log.info("Prompt updated successfully", { promptId: id })

    revalidatePath("/prompt-library")

    return createSuccess(getResult.data, "Prompt updated successfully")
  } catch (error) {
    timer({ status: "error" })
    return handleError(error, "Failed to update prompt", {
      context: "updatePrompt",
      requestId,
      operation: "updatePrompt",
      metadata: { promptId: id }
    })
  }
}

/**
 * Soft delete a prompt
 */
export async function deletePrompt(id: string): Promise<ActionState<void>> {
  const requestId = generateRequestId()
  const timer = startTimer("deletePrompt")
  const log = createLogger({ requestId, action: "deletePrompt" })

  try {
    log.info("Action started: Deleting prompt", { promptId: id })

    // Auth check
    const session = await getServerSession()
    if (!session) {
      log.warn("Unauthorized prompt deletion attempt")
      throw ErrorFactories.authNoSession()
    }

    const userId = await getUserIdFromSession(session.sub)

    // Check delete access
    const canDelete = await canDeletePrompt(id, userId)
    if (!canDelete) {
      log.warn("Prompt deletion denied", { promptId: id, userId })
      throw ErrorFactories.authzOwnerRequired("delete this prompt")
    }

    // Soft delete
    await executeSQL(
      `UPDATE prompt_library
       SET deleted_at = CURRENT_TIMESTAMP
       WHERE id = :id AND deleted_at IS NULL`,
      [{ name: "id", value: { stringValue: id } }]
    )

    timer({ status: "success" })
    log.info("Prompt deleted successfully", { promptId: id })

    revalidatePath("/prompt-library")

    return createSuccess(undefined, "Prompt deleted successfully")
  } catch (error) {
    timer({ status: "error" })
    return handleError(error, "Failed to delete prompt", {
      context: "deletePrompt",
      requestId,
      operation: "deletePrompt",
      metadata: { promptId: id }
    })
  }
}

/**
 * Helper: Assign tags to a prompt
 */
async function assignTagsToPrompt(
  promptId: string,
  tagNames: string[],
  log: ReturnType<typeof createLogger>
): Promise<void> {
  if (tagNames.length === 0) return

  // Insert tags if they don't exist
  for (const tagName of tagNames) {
    await executeSQL(
      `INSERT INTO prompt_tags (name)
       VALUES (:name)
       ON CONFLICT (name) DO NOTHING`,
      [{ name: "name", value: { stringValue: tagName.trim() } }]
    )
  }

  // Get tag IDs
  const tagResults = await executeSQL<{ id: number }>(
    `SELECT id FROM prompt_tags WHERE name = ANY(:names)`,
    [
      {
        name: "names",
        value: { arrayValue: { stringValues: tagNames.map(t => t.trim()) } }
      }
    ]
  )

  // Create associations
  for (const tag of tagResults) {
    await executeSQL(
      `INSERT INTO prompt_library_tags (prompt_id, tag_id)
       VALUES (:promptId, :tagId)
       ON CONFLICT DO NOTHING`,
      [
        { name: "promptId", value: { stringValue: promptId } },
        { name: "tagId", value: { longValue: tag.id } }
      ]
    )
  }

  log.debug("Tags assigned to prompt", {
    promptId,
    tagCount: tagResults.length
  })
}

/**
 * Helper: Update tags for a prompt
 */
async function updateTagsForPrompt(
  promptId: string,
  tagNames: string[],
  log: ReturnType<typeof createLogger>
): Promise<void> {
  // Remove existing tags
  await executeSQL(
    `DELETE FROM prompt_library_tags WHERE prompt_id = :promptId`,
    [{ name: "promptId", value: { stringValue: promptId } }]
  )

  // Assign new tags
  if (tagNames.length > 0) {
    await assignTagsToPrompt(promptId, tagNames, log)
  }

  log.debug("Tags updated for prompt", {
    promptId,
    tagCount: tagNames.length
  })
}
