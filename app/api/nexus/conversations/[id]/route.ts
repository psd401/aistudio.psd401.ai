import { getServerSession } from '@/lib/auth/server-session'
import { createLogger, generateRequestId, startTimer, sanitizeForLogging } from '@/lib/logger'
import { executeSQL } from '@/lib/streaming/nexus/db-helpers'
import { transformSnakeToCamel } from '@/lib/db/field-mapper'
import { getCurrentUserAction } from '@/actions/db/get-current-user-action'
import { NextRequest } from 'next/server'

/**
 * PATCH /api/nexus/conversations/[id] - Update a conversation
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = generateRequestId()
  const timer = startTimer('nexus.conversations.update')
  const log = createLogger({ requestId, route: 'nexus.conversations.update' })
  
  try {
    const resolvedParams = await params
    const conversationId = resolvedParams.id
    
    log.info('PATCH /api/nexus/conversations/[id]', { conversationId })
  
    // Authenticate user
    const session = await getServerSession()
    if (!session) {
      log.warn('Unauthorized request')
      timer({ status: 'error', reason: 'unauthorized' })
      return new Response('Unauthorized', { status: 401 })
    }
    
    // Get current user with integer ID
    const currentUser = await getCurrentUserAction()
    if (!currentUser.isSuccess) {
      log.error('Failed to get current user')
      timer({ status: 'error', reason: 'user_lookup_failed' })
      return new Response('Unauthorized', { status: 401 })
    }
    
    const userId = currentUser.data.user.id
    
    // Parse request body
    const body = await req.json()
    const { title, isArchived, isPinned, metadata } = body
    
    log.debug('Update conversation request', sanitizeForLogging({
      conversationId,
      title: title ? `${title.substring(0, 20)}...` : undefined,
      isArchived,
      isPinned
    }))
    
    // Verify user owns this conversation
    const existingQuery = `
      SELECT id FROM nexus_conversations 
      WHERE id = $1::uuid AND user_id = $2
    `
    const existingResult = await executeSQL(existingQuery, [conversationId, userId])
    
    if (existingResult.length === 0) {
      log.warn('Conversation not found or access denied', { conversationId, userId })
      timer({ status: 'error', reason: 'not_found' })
      return new Response('Conversation not found', { status: 404 })
    }
    
    // Build update query dynamically based on provided fields
    const updateFields = []
    const updateParams = []
    let paramIndex = 1
    
    if (title !== undefined) {
      updateFields.push(`title = $${paramIndex}`)
      updateParams.push(title)
      paramIndex++
    }
    
    if (isArchived !== undefined) {
      updateFields.push(`is_archived = $${paramIndex}`)
      updateParams.push(isArchived)
      paramIndex++
    }
    
    if (isPinned !== undefined) {
      updateFields.push(`is_pinned = $${paramIndex}`)
      updateParams.push(isPinned)
      paramIndex++
    }
    
    if (metadata !== undefined) {
      updateFields.push(`metadata = $${paramIndex}`)
      updateParams.push(metadata)
      paramIndex++
    }
    
    if (updateFields.length === 0) {
      log.warn('No fields to update')
      return Response.json({ message: 'No fields to update' })
    }
    
    // Always update the updated_at timestamp
    updateFields.push('updated_at = CURRENT_TIMESTAMP')
    
    // Add WHERE clause parameters
    updateParams.push(conversationId, userId)
    const whereClauseStart = paramIndex
    
    const updateQuery = `
      UPDATE nexus_conversations 
      SET ${updateFields.join(', ')}
      WHERE id = $${whereClauseStart}::uuid AND user_id = $${whereClauseStart + 1}
      RETURNING 
        id, title, is_archived, is_pinned, updated_at
    `
    
    const result = await executeSQL(updateQuery, updateParams)
    const updatedConversation = transformSnakeToCamel(result[0])
    
    timer({ status: 'success' })
    log.info('Conversation updated successfully', {
      requestId,
      conversationId,
      userId,
      updatedFields: updateFields.length - 1 // Exclude updated_at from count
    })
    
    return Response.json(updatedConversation)
    
  } catch (error) {
    timer({ status: 'error' })
    log.error('Failed to update conversation', {
      error: error instanceof Error ? error.message : String(error)
    })
    
    return new Response(
      JSON.stringify({
        error: 'Failed to update conversation'
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    )
  }
}