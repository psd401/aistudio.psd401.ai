import { NextRequest } from 'next/server';
import { getServerSession } from '@/lib/auth/server-session';
import { getCurrentUserAction } from '@/actions/db/get-current-user-action';
import { executeSQL, FormattedRow } from '@/lib/db/data-api-adapter';
import { createLogger, generateRequestId, startTimer } from '@/lib/logger';
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const requestId = generateRequestId();
  const timer = startTimer("api.conversations.messages.list");
  const log = createLogger({ requestId, route: "api.conversations.messages" });
  
  log.info("GET /api/conversations/[id]/messages - Fetching conversation messages");
  
  const session = await getServerSession();
  if (!session) {
    log.warn("Unauthorized - No session");
    timer({ status: "error", reason: "unauthorized" });
    return new Response('Unauthorized', { status: 401, headers: { "X-Request-Id": requestId } });
  }
  
  const currentUser = await getCurrentUserAction();
  if (!currentUser.isSuccess) {
    log.warn("Unauthorized - User not found");
    timer({ status: "error", reason: "user_not_found" });
    return new Response('Unauthorized', { status: 401, headers: { "X-Request-Id": requestId } });
  }
  
  const userId = currentUser.data.user.id;

  // Await the params object
  const params = await context.params;
  const conversationId = parseInt(params.id);
  if (isNaN(conversationId)) {
    log.warn("Invalid conversation ID", { id: params.id });
    timer({ status: "error", reason: "invalid_id" });
    return new Response('Invalid conversation ID', { status: 400, headers: { "X-Request-Id": requestId } });
  }
  
  log.debug("Fetching messages for conversation", { conversationId });

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
      log.warn("Conversation not found or access denied", { conversationId, userId });
      timer({ status: "error", reason: "not_found" });
      return new Response('Not found', { status: 404, headers: { "X-Request-Id": requestId } });
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

    log.info("Messages fetched successfully", { conversationId, messageCount: formattedMessages.length });
    timer({ status: "success", count: formattedMessages.length });
    
    return new Response(JSON.stringify(formattedMessages), {
      headers: { 
        'Content-Type': 'application/json',
        'X-Request-Id': requestId 
      },
    });
  } catch (error) {
    timer({ status: "error" });
    log.error('Failed to fetch messages', error);
    return new Response(
      JSON.stringify({ error: 'Failed to fetch messages' }),
      { status: 500, headers: { 
        'Content-Type': 'application/json',
        'X-Request-Id': requestId 
      } }
    );
  }
} 