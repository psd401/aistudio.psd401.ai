import { NextRequest } from 'next/server';
import { getServerSession } from '@/lib/auth/server-session';
import { getCurrentUserAction } from '@/actions/db/get-current-user-action';
import { executeSQL } from '@/lib/db/data-api-adapter';
import { SqlParameter } from '@aws-sdk/client-rds-data';
import logger from '@/lib/logger';

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession();
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }
  
  const currentUser = await getCurrentUserAction();
  if (!currentUser.isSuccess) {
    return new Response('Unauthorized', { status: 401 });
  }
  
  const userId = currentUser.data.user.id;

  // Await the params object
  const params = await context.params;
  const conversationId = parseInt(params.id);
  if (isNaN(conversationId)) {
    return new Response('Invalid conversation ID', { status: 400 });
  }

  try {
    // Verify ownership
    const checkQuery = `
      SELECT id, user_id 
      FROM conversations 
      WHERE id = :conversationId
    `;
    const checkParams: SqlParameter[] = [
      { name: 'conversationId', value: { longValue: conversationId } }
    ];
    const conversation = await executeSQL(checkQuery, checkParams);

    if (!conversation.length || conversation[0].userId !== userId) {
      return new Response('Not found', { status: 404 });
    }

    // Delete document chunks first (they reference documents)
    const deleteChunksQuery = `
      DELETE FROM document_chunks 
      WHERE document_id IN (
        SELECT id FROM documents 
        WHERE conversation_id = :conversationId
      )
    `;
    await executeSQL(deleteChunksQuery, checkParams);

    // Delete documents
    const deleteDocumentsQuery = `
      DELETE FROM documents 
      WHERE conversation_id = :conversationId
    `;
    await executeSQL(deleteDocumentsQuery, checkParams);

    // Delete all messages
    const deleteMessagesQuery = `
      DELETE FROM messages 
      WHERE conversation_id = :conversationId
    `;
    await executeSQL(deleteMessagesQuery, checkParams);

    // Finally delete the conversation
    const deleteConversationQuery = `
      DELETE FROM conversations 
      WHERE id = :conversationId
    `;
    await executeSQL(deleteConversationQuery, checkParams);

    return new Response(null, { status: 204 });
  } catch (error) {
    logger.error('Failed to delete conversation:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to delete conversation' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession();
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }
  
  const currentUser = await getCurrentUserAction();
  if (!currentUser.isSuccess) {
    return new Response('Unauthorized', { status: 401 });
  }
  
  const userId = currentUser.data.user.id;

  // Await the params object
  const params = await context.params;
  const conversationId = parseInt(params.id);
  if (isNaN(conversationId)) {
    return new Response('Invalid conversation ID', { status: 400 });
  }

  try {
    // Verify ownership
    const checkQuery = `
      SELECT id, user_id 
      FROM conversations 
      WHERE id = :conversationId
    `;
    const checkParams: SqlParameter[] = [
      { name: 'conversationId', value: { longValue: conversationId } }
    ];
    const conversation = await executeSQL(checkQuery, checkParams);

    if (!conversation.length || conversation[0].userId !== userId) {
      return new Response('Not found', { status: 404 });
    }

    const body = await req.json();
    if (!body.title || typeof body.title !== 'string') {
      return new Response('Invalid title', { status: 400 });
    }

    const updateQuery = `
      UPDATE conversations 
      SET title = :title, updated_at = NOW() 
      WHERE id = :conversationId
    `;
    const updateParams: SqlParameter[] = [
      { name: 'title', value: { stringValue: body.title.slice(0, 100) } },
      { name: 'conversationId', value: { longValue: conversationId } }
    ];
    await executeSQL(updateQuery, updateParams);

    return new Response(null, { status: 204 });
  } catch (error) {
    logger.error('Failed to update conversation:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to update conversation' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
} 