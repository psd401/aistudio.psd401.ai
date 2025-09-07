import { getServerSession } from '@/lib/auth/server-session'
import { createLogger, generateRequestId, startTimer, sanitizeForLogging } from '@/lib/logger'
import { executeSQL } from '@/lib/streaming/nexus/db-helpers'
import { getCurrentUserAction } from '@/actions/db/get-current-user-action'
import { NextRequest } from 'next/server'

/**
 * POST /api/nexus/messages - Save a message to a conversation
 */
export async function POST(req: NextRequest) {
  const requestId = generateRequestId()
  const timer = startTimer('nexus.messages.create')
  const log = createLogger({ requestId, route: 'nexus.messages.create' })
  
  log.info('POST /api/nexus/messages - Saving message')
  
  try {
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
    const {
      conversationId,
      messageId,
      role,
      content,
      parts,
      modelId,
      reasoningContent,
      tokenUsage,
      finishReason,
      metadata = {}
    } = body
    
    log.debug('Message save request', sanitizeForLogging({
      conversationId,
      messageId,
      role,
      contentLength: content?.length || 0,
      partsCount: Array.isArray(parts) ? parts.length : 0
    }))
    
    // Validate required fields
    if (!conversationId || !messageId || !role) {
      log.warn('Missing required fields', { conversationId, messageId, role })
      timer({ status: 'error', reason: 'validation' })
      return new Response(
        JSON.stringify({ error: 'Missing required fields: conversationId, messageId, role' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }
    
    // Verify user owns this conversation
    const conversationQuery = `
      SELECT id FROM nexus_conversations 
      WHERE id = :conversationId AND user_id = :userId
    `
    const conversationResult = await executeSQL(conversationQuery, [
      { name: 'conversationId', value: { stringValue: conversationId } },
      { name: 'userId', value: { longValue: userId } }
    ])
    
    if (conversationResult.length === 0) {
      log.warn('Conversation not found or access denied', { conversationId, userId })
      timer({ status: 'error', reason: 'not_found' })
      return new Response('Conversation not found', { status: 404 })
    }
    
    // Check if message already exists (upsert logic)
    const existingMessageQuery = `
      SELECT id FROM nexus_messages 
      WHERE id = :messageId AND conversation_id = :conversationId
    `
    const existingResult = await executeSQL(existingMessageQuery, [
      { name: 'messageId', value: { stringValue: messageId } },
      { name: 'conversationId', value: { stringValue: conversationId } }
    ])
    
    if (existingResult.length > 0) {
      // Update existing message
      await executeSQL(`
        UPDATE nexus_messages SET
          role = $1,
          content = $2,
          parts = $3,
          model_id = $4,
          reasoning_content = $5,
          token_usage = $6,
          finish_reason = $7,
          metadata = $8,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $9 AND conversation_id = $10
      `, [
        role,
        content || null,
        parts || null,
        modelId || null,
        reasoningContent || null,
        tokenUsage || null,
        finishReason || null,
        metadata,
        messageId,
        conversationId
      ])
      
      log.debug('Message updated', { messageId, conversationId })
      
    } else {
      // Insert new message
      await executeSQL(`
        INSERT INTO nexus_messages (
          id,
          conversation_id,
          role,
          content,
          parts,
          model_id,
          reasoning_content,
          token_usage,
          finish_reason,
          metadata,
          created_at,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `, [
        messageId,
        conversationId,
        role,
        content || null,
        parts || null,
        modelId || null,
        reasoningContent || null,
        tokenUsage || null,
        finishReason || null,
        metadata
      ])
      
      log.debug('Message created', { messageId, conversationId })
    }
    
    // Update conversation stats
    await executeSQL(`
      UPDATE nexus_conversations SET
        message_count = (
          SELECT COUNT(*) FROM nexus_messages 
          WHERE conversation_id = $1
        ),
        last_message_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [conversationId])
    
    timer({ status: 'success' })
    log.info('Message saved successfully', {
      requestId,
      messageId,
      conversationId,
      userId,
      role
    })
    
    return Response.json({ 
      success: true, 
      messageId,
      conversationId 
    })
    
  } catch (error) {
    timer({ status: 'error' })
    log.error('Failed to save message', {
      error: error instanceof Error ? error.message : String(error)
    })
    
    return new Response(
      JSON.stringify({
        error: 'Failed to save message'
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    )
  }
}