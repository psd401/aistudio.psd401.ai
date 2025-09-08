"use server"
import { createLogger, generateRequestId, startTimer, sanitizeForLogging } from "@/lib/logger"
import { handleError, ErrorFactories, createSuccess } from "@/lib/error-utils"
import { getServerSession } from "@/lib/auth/server-session"
import { getCurrentUserAction } from "@/actions/db/get-current-user-action"
import { executeSQL } from "@/lib/streaming/nexus/db-helpers"
import type { ActionState } from "@/types"

interface ArchiveConversationParams {
  conversationId: string
}

interface ArchiveConversationResult {
  conversationId: string
  isArchived: boolean
}

export async function archiveConversationAction(params: ArchiveConversationParams): Promise<ActionState<ArchiveConversationResult>> {
  const requestId = generateRequestId()
  const timer = startTimer("archiveConversation")
  const log = createLogger({ requestId, action: "archiveConversation" })
  
  try {
    log.info("Action started", { params: sanitizeForLogging(params) })
    
    // Auth check
    const session = await getServerSession()
    if (!session) {
      log.warn("Unauthorized")
      throw ErrorFactories.authNoSession()
    }
    
    // Get current user with integer ID
    const currentUser = await getCurrentUserAction()
    if (!currentUser.isSuccess) {
      log.error("Failed to get current user")
      throw ErrorFactories.authNoSession()
    }
    
    const userId = currentUser.data.user.id
    const { conversationId } = params
    
    // Verify conversation exists and user owns it
    const existingQuery = `
      SELECT id, title, is_archived FROM nexus_conversations 
      WHERE id = $1::uuid AND user_id = $2
    `
    const existingResult = await executeSQL(existingQuery, [conversationId, userId])
    
    if (existingResult.length === 0) {
      log.warn("Conversation not found or access denied", { conversationId, userId })
      throw ErrorFactories.dbRecordNotFound("nexus_conversations", conversationId)
    }
    
    const conversation = existingResult[0]
    
    // If already archived, return success
    if (conversation.is_archived) {
      log.info("Conversation already archived", { conversationId })
      timer({ status: "success" })
      return createSuccess({ conversationId, isArchived: true }, "Conversation is already archived")
    }
    
    // Archive the conversation
    const updateQuery = `
      UPDATE nexus_conversations 
      SET is_archived = true, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1::uuid AND user_id = $2
      RETURNING id, is_archived
    `
    
    const result = await executeSQL(updateQuery, [conversationId, userId])
    
    if (result.length === 0) {
      log.error("Failed to archive conversation - no rows updated")
      throw ErrorFactories.sysInternalError("Failed to archive conversation")
    }
    
    const archivedConversation = result[0]
    
    timer({ status: "success" })
    log.info("Action completed", { 
      conversationId, 
      isArchived: archivedConversation.is_archived 
    })
    
    return createSuccess(
      { 
        conversationId: String(archivedConversation.id), 
        isArchived: Boolean(archivedConversation.is_archived)
      }, 
      "Conversation archived successfully"
    )
    
  } catch (error) {
    timer({ status: "error" })
    return handleError(error, "Failed to archive conversation", {
      context: "archiveConversation",
      requestId,
      operation: "archiveConversation"
    })
  }
}