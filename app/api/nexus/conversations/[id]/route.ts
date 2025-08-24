import { getServerSession } from '@/lib/auth/server-session';
import { createLogger, generateRequestId, startTimer } from '@/lib/logger';
import { executeSQL } from '@/lib/streaming/nexus/db-helpers';
import { transformSnakeToCamel } from '@/lib/db/field-mapper';


interface ConversationDetail {
  id: string;
  userId: number;
  title: string;
  provider: string;
  modelUsed: string;
  messageCount: number;
  totalTokens: number;
  lastMessageAt?: string;
  createdAt: string;
  updatedAt: string;
  isArchived: boolean;
  isPinned: boolean;
  externalId?: string;
  cacheKey?: string;
  metadata?: Record<string, unknown>;
}

/**
 * GET /api/nexus/conversations/[id] - Get conversation details
 */
export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  const requestId = generateRequestId();
  const timer = startTimer('nexus.conversation.get');
  const conversationId = params.id;
  const log = createLogger({ 
    requestId, 
    route: 'nexus.conversation.get',
    conversationId 
  });
  
  log.info('GET /api/nexus/conversations/[id] - Getting conversation');
  
  try {
    // Authenticate user
    const session = await getServerSession();
    if (!session) {
      log.warn('Unauthorized request');
      timer({ status: 'error', reason: 'unauthorized' });
      return new Response('Unauthorized', { status: 401 });
    }
    
    const userId = session.sub;
    
    // Get conversation
    const result = await executeSQL(`
      SELECT 
        id,
        user_id,
        title,
        provider,
        model_used,
        message_count,
        total_tokens,
        last_message_at,
        created_at,
        updated_at,
        is_archived,
        is_pinned,
        external_id,
        cache_key,
        metadata
      FROM nexus_conversations
      WHERE id = $1 AND user_id = $2
    `, [conversationId, userId]);
    
    if (result.length === 0) {
      log.warn('Conversation not found', { conversationId, userId });
      timer({ status: 'error', reason: 'not_found' });
      return new Response('Conversation not found', { status: 404 });
    }
    
    const conversation = transformSnakeToCamel<ConversationDetail>(result[0]);
    
    // Get recent events
    const events = await executeSQL(`
      SELECT 
        event_type,
        event_data,
        created_at
      FROM nexus_conversation_events
      WHERE conversation_id = $1
      ORDER BY created_at DESC
      LIMIT 10
    `, [conversationId]);
    
    timer({ status: 'success' });
    log.info('Conversation retrieved', {
      requestId,
      conversationId,
      provider: conversation.provider,
      messageCount: conversation.messageCount
    });
    
    return Response.json({
      conversation,
      recentEvents: events.map(e => transformSnakeToCamel(e))
    });
    
  } catch (error) {
    timer({ status: 'error' });
    log.error('Failed to get conversation', {
      conversationId,
      error: error instanceof Error ? error.message : String(error)
    });
    
    return new Response(
      JSON.stringify({
        error: 'Failed to retrieve conversation'
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

/**
 * PATCH /api/nexus/conversations/[id] - Update conversation
 */
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const requestId = generateRequestId();
  const timer = startTimer('nexus.conversation.update');
  const conversationId = params.id;
  const log = createLogger({ 
    requestId, 
    route: 'nexus.conversation.update',
    conversationId 
  });
  
  log.info('PATCH /api/nexus/conversations/[id] - Updating conversation');
  
  try {
    // Authenticate user
    const session = await getServerSession();
    if (!session) {
      log.warn('Unauthorized request');
      timer({ status: 'error', reason: 'unauthorized' });
      return new Response('Unauthorized', { status: 401 });
    }
    
    const userId = session.sub;
    
    // Parse request body
    const body = await req.json();
    const updates: string[] = [];
    const values: (string | boolean | Record<string, unknown>)[] = [];
    let paramCount = 1;
    
    // Build dynamic update query
    if (body.title !== undefined) {
      updates.push(`title = $${paramCount++}`);
      values.push(body.title as string);
    }
    
    if (body.isArchived !== undefined) {
      updates.push(`is_archived = $${paramCount++}`);
      values.push(body.isArchived as boolean);
    }
    
    if (body.isPinned !== undefined) {
      updates.push(`is_pinned = $${paramCount++}`);
      values.push(body.isPinned as boolean);
    }
    
    if (body.metadata !== undefined) {
      updates.push(`metadata = $${paramCount++}`);
      values.push(body.metadata as Record<string, unknown>);
    }
    
    if (updates.length === 0) {
      return Response.json({ message: 'No updates provided' });
    }
    
    // Add updated_at
    updates.push('updated_at = NOW()');
    
    // Add conversation ID and user ID to values
    values.push(conversationId, userId);
    
    // Execute update
    const query = `
      UPDATE nexus_conversations
      SET ${updates.join(', ')}
      WHERE id = $${paramCount} AND user_id = $${paramCount + 1}
      RETURNING 
        id,
        title,
        provider,
        model_used,
        is_archived,
        is_pinned,
        updated_at
    `;
    
    const result = await executeSQL(query, values);
    
    if (result.length === 0) {
      log.warn('Conversation not found or unauthorized', { 
        conversationId, 
        userId 
      });
      timer({ status: 'error', reason: 'not_found' });
      return new Response('Conversation not found', { status: 404 });
    }
    
    const updated = transformSnakeToCamel(result[0]);
    
    // Record update event
    await executeSQL(`
      INSERT INTO nexus_conversation_events (
        conversation_id,
        event_type,
        event_data,
        created_at
      ) VALUES ($1, $2, $3, NOW())
    `, [
      conversationId,
      'conversation_updated',
      JSON.stringify({
        updates: Object.keys(body),
        updatedBy: userId
      })
    ]);
    
    timer({ status: 'success' });
    log.info('Conversation updated', {
      requestId,
      conversationId,
      updates: Object.keys(body)
    });
    
    return Response.json(updated);
    
  } catch (error) {
    timer({ status: 'error' });
    log.error('Failed to update conversation', {
      conversationId,
      error: error instanceof Error ? error.message : String(error)
    });
    
    return new Response(
      JSON.stringify({
        error: 'Failed to update conversation'
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

/**
 * DELETE /api/nexus/conversations/[id] - Delete conversation
 */
export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  const requestId = generateRequestId();
  const timer = startTimer('nexus.conversation.delete');
  const conversationId = params.id;
  const log = createLogger({ 
    requestId, 
    route: 'nexus.conversation.delete',
    conversationId 
  });
  
  log.info('DELETE /api/nexus/conversations/[id] - Deleting conversation');
  
  try {
    // Authenticate user
    const session = await getServerSession();
    if (!session) {
      log.warn('Unauthorized request');
      timer({ status: 'error', reason: 'unauthorized' });
      return new Response('Unauthorized', { status: 401 });
    }
    
    const userId = session.sub;
    
    // Delete conversation events first (foreign key constraint)
    await executeSQL(`
      DELETE FROM nexus_conversation_events
      WHERE conversation_id = $1
    `, [conversationId]);
    
    // Delete cache entries
    await executeSQL(`
      DELETE FROM nexus_cache_entries
      WHERE conversation_id = $1
    `, [conversationId]);
    
    // Delete conversation
    const result = await executeSQL(`
      DELETE FROM nexus_conversations
      WHERE id = $1 AND user_id = $2
      RETURNING id
    `, [conversationId, userId]);
    
    if (result.length === 0) {
      log.warn('Conversation not found or unauthorized', { 
        conversationId, 
        userId 
      });
      timer({ status: 'error', reason: 'not_found' });
      return new Response('Conversation not found', { status: 404 });
    }
    
    timer({ status: 'success' });
    log.info('Conversation deleted', {
      requestId,
      conversationId
    });
    
    return Response.json({ 
      message: 'Conversation deleted successfully',
      conversationId 
    });
    
  } catch (error) {
    timer({ status: 'error' });
    log.error('Failed to delete conversation', {
      conversationId,
      error: error instanceof Error ? error.message : String(error)
    });
    
    return new Response(
      JSON.stringify({
        error: 'Failed to delete conversation'
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}