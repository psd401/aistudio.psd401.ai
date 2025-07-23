import { NextRequest } from 'next/server';
import { transformSnakeToCamel } from "@/lib/db/field-mapper"
import { getServerSession } from '@/lib/auth/server-session';
import { getCurrentUserAction } from '@/actions/db/get-current-user-action';
import { executeSQL, FormattedRow } from '@/lib/db/data-api-adapter';
import logger from '@/lib/logger';
export async function GET(
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
    const checkParams = [
      { name: 'conversationId', value: { longValue: conversationId } }
    ];
    const conversation = await executeSQL(checkQuery, checkParams);

    if (!conversation.length || conversation[0].user_id !== userId) {
      return new Response('Not found', { status: 404 });
    }

    // Fetch all messages for the conversation
    const messagesQuery = `
      SELECT id, role, content, created_at
      FROM messages
      WHERE conversation_id = :conversationId
      ORDER BY created_at ASC
    `;
    const messagesParams = [
      { name: 'conversationId', value: { longValue: conversationId } }
    ];
    const conversationMessages = await executeSQL<FormattedRow>(messagesQuery, messagesParams);

    // Format messages for the chat
    const formattedMessages = conversationMessages.map(msg => ({
      id: msg.id ? msg.id.toString() : '',
      role: msg.role,
      content: msg.content
    }));

    return new Response(JSON.stringify(formattedMessages), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    logger.error('Failed to fetch messages:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to fetch messages' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
} 