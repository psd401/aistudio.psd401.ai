import { getServerSession } from '@/lib/auth/server-session'
import { createLogger, generateRequestId, startTimer } from '@/lib/logger'
import { executeSQL } from '@/lib/streaming/nexus/db-helpers'
import { transformSnakeToCamel } from '@/lib/db/field-mapper'
import { getCurrentUserAction } from '@/actions/db/get-current-user-action'
import { NextRequest } from 'next/server'

interface NexusMessage {
  id: string
  conversationId: string
  role: 'user' | 'assistant' | 'system'
  content: string
  parts?: Array<{ type: string; text?: string; [key: string]: unknown }>
  modelId?: number
  reasoningContent?: string
  tokenUsage?: {
    promptTokens?: number
    completionTokens?: number
    totalTokens?: number
  }
  finishReason?: string
  metadata?: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

/**
 * GET /api/nexus/conversations/[id]/messages - Get messages for a conversation
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = generateRequestId()
  const timer = startTimer('nexus.conversations.messages.get')
  const log = createLogger({ requestId, route: 'nexus.conversations.messages.get' })
  
  try {
    const resolvedParams = await params
    const conversationId = resolvedParams.id
    
    log.info('GET /api/nexus/conversations/[id]/messages', { conversationId })
  
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
    
    // Verify user owns this conversation
    const conversationQuery = `
      SELECT id, title FROM nexus_conversations 
      WHERE id = $1::uuid AND user_id = $2
    `
    const conversationResult = await executeSQL(conversationQuery, [
      conversationId,
      userId
    ])
    
    if (conversationResult.length === 0) {
      log.warn('Conversation not found or access denied', { conversationId, userId })
      timer({ status: 'error', reason: 'not_found' })
      return new Response('Conversation not found', { status: 404 })
    }
    
    // Parse query parameters
    const url = new URL(req.url)
    const limit = parseInt(url.searchParams.get('limit') || '50')
    const offset = parseInt(url.searchParams.get('offset') || '0')
    
    // Query messages
    const query = `
      SELECT 
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
      FROM nexus_messages
      WHERE conversation_id = $1::uuid
      ORDER BY created_at ASC
      LIMIT $2 OFFSET $3
    `
    
    const result = await executeSQL(query, [
      conversationId,
      limit,
      offset
    ])
    
    // Transform snake_case to camelCase and format for AI SDK
    const messages: NexusMessage[] = result.map(row => 
      transformSnakeToCamel<NexusMessage>(row)
    )
    
    // Convert to AI SDK format
    const aiSdkMessages = messages.map(msg => {
      const baseMessage = {
        id: msg.id,
        role: msg.role,
        createdAt: new Date(msg.createdAt),
        ...(msg.metadata && { metadata: msg.metadata })
      }
      
      // Handle content format - prefer parts over plain content
      if (msg.parts && Array.isArray(msg.parts)) {
        return {
          ...baseMessage,
          content: msg.parts
        }
      } else if (msg.content) {
        return {
          ...baseMessage,
          content: [{ type: 'text', text: msg.content }]
        }
      } else {
        return {
          ...baseMessage,
          content: [{ type: 'text', text: '' }]
        }
      }
    })
    
    timer({ status: 'success' })
    log.info('Messages retrieved', {
      requestId,
      conversationId,
      userId,
      messageCount: messages.length
    })
    
    return Response.json({
      messages: aiSdkMessages,
      conversation: {
        id: conversationResult[0].id,
        title: conversationResult[0].title
      },
      pagination: {
        limit,
        offset,
        total: messages.length
      }
    })
    
  } catch (error) {
    timer({ status: 'error' })
    log.error('Failed to get messages', {
      error: error instanceof Error ? error.message : String(error)
    })
    
    return new Response(
      JSON.stringify({
        error: 'Failed to retrieve messages'
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    )
  }
}