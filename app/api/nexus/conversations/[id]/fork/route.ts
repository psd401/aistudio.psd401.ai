import { getServerSession } from '@/lib/auth/server-session';
import { createLogger, generateRequestId, startTimer } from '@/lib/logger';
import { executeSQL } from '@/lib/streaming/nexus/db-helpers';
import { transformSnakeToCamel } from '@/lib/db/field-mapper';


interface ForkRequest {
  atMessageId?: string;
  newTitle?: string;
  metadata?: Record<string, unknown>;
}

/**
 * POST /api/nexus/conversations/[id]/fork - Fork a conversation
 */
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const requestId = generateRequestId();
  const timer = startTimer('nexus.conversation.fork');
  const originalConversationId = params.id;
  const log = createLogger({ 
    requestId, 
    route: 'nexus.conversation.fork',
    originalConversationId 
  });
  
  log.info('POST /api/nexus/conversations/[id]/fork - Forking conversation');
  
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
    const body: ForkRequest = await req.json();
    
    // Get original conversation
    const originalResult = await executeSQL(`
      SELECT 
        id,
        user_id,
        title,
        provider,
        model_used,
        external_id,
        cache_key,
        metadata
      FROM nexus_conversations
      WHERE id = $1 AND user_id = $2
    `, [originalConversationId, userId]);
    
    if (originalResult.length === 0) {
      log.warn('Original conversation not found', { 
        originalConversationId, 
        userId 
      });
      timer({ status: 'error', reason: 'not_found' });
      return new Response('Conversation not found', { status: 404 });
    }
    
    const original = originalResult[0];
    
    // Create forked conversation
    const newTitle = body.newTitle || `${original.title} (Fork)`;
    const newMetadata = {
      ...(original.metadata || {}),
      ...(body.metadata || {}),
      forkedFrom: originalConversationId,
      forkedAt: new Date().toISOString(),
      atMessageId: body.atMessageId
    };
    
    const forkResult = await executeSQL(`
      INSERT INTO nexus_conversations (
        user_id,
        title,
        provider,
        model_used,
        external_id,
        cache_key,
        message_count,
        total_tokens,
        metadata,
        created_at,
        updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, 0, 0, $7, NOW(), NOW()
      ) RETURNING 
        id,
        title,
        provider,
        model_used,
        metadata,
        created_at,
        updated_at
    `, [
      userId,
      newTitle,
      original.provider as string,
      original.model_used as string,
      null, // New external_id will be set on first message
      null, // New cache_key will be generated
      newMetadata as Record<string, unknown>
    ]);
    
    const forkedConversation = transformSnakeToCamel<{
      id: string;
      title: string;
      provider: string;
      modelUsed: string;
      metadata: Record<string, unknown>;
      createdAt: string;
      updatedAt: string;
    }>(forkResult[0]);
    
    // Record fork event in both conversations
    await executeSQL(`
      INSERT INTO nexus_conversation_events (
        conversation_id,
        event_type,
        event_data,
        created_at
      ) VALUES 
        ($1, $2, $3, NOW()),
        ($4, $5, $6, NOW())
    `, [
      originalConversationId,
      'conversation_forked',
      JSON.stringify({
        forkedTo: forkedConversation.id,
        atMessageId: body.atMessageId,
        forkedBy: userId
      }),
      forkedConversation.id as string,
      'conversation_created_from_fork',
      JSON.stringify({
        forkedFrom: originalConversationId,
        atMessageId: body.atMessageId,
        createdBy: userId
      })
    ]);
    
    // If OpenAI with external_id, handle forking at provider level
    if (original.provider === 'openai' && original.external_id && body.atMessageId) {
      // Store the fork point for later use when continuing the conversation
      await executeSQL(`
        UPDATE nexus_conversations
        SET metadata = jsonb_set(
          COALESCE(metadata, '{}'::jsonb),
          '{forkPoint}',
          $1::jsonb
        )
        WHERE id = $2
      `, [
        JSON.stringify({
          originalResponseId: original.external_id,
          atMessageId: body.atMessageId
        }),
        forkedConversation.id
      ]);
    }
    
    timer({ status: 'success' });
    log.info('Conversation forked successfully', {
      requestId,
      originalConversationId,
      forkedConversationId: forkedConversation.id,
      provider: original.provider
    });
    
    return Response.json({
      originalConversationId,
      forkedConversation,
      forkMetadata: {
        atMessageId: body.atMessageId,
        timestamp: new Date().toISOString(),
        provider: original.provider,
        supportsNativeFork: original.provider === 'openai' && !!original.external_id
      }
    });
    
  } catch (error) {
    timer({ status: 'error' });
    log.error('Failed to fork conversation', {
      originalConversationId,
      error: error instanceof Error ? error.message : String(error)
    });
    
    return new Response(
      JSON.stringify({
        error: 'Failed to fork conversation'
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}