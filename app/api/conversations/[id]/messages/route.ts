import { db } from '@/db/db';
import { messagesTable, conversationsTable } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getAuth } from '@clerk/nextjs/server';
import { NextRequest } from 'next/server';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { userId } = getAuth(req);
  if (!userId) {
    return new Response('Unauthorized', { status: 401 });
  }

  // Await the params object
  const params = await context.params;
  const conversationId = parseInt(params.id);
  if (isNaN(conversationId)) {
    return new Response('Invalid conversation ID', { status: 400 });
  }

  try {
    // Verify ownership
    const conversation = await db
      .select()
      .from(conversationsTable)
      .where(eq(conversationsTable.id, conversationId))
      .limit(1);

    if (!conversation.length || conversation[0].clerkId !== userId) {
      return new Response('Not found', { status: 404 });
    }

    // Fetch all messages for the conversation
    const conversationMessages = await db
      .select()
      .from(messagesTable)
      .where(eq(messagesTable.conversationId, conversationId))
      .orderBy(messagesTable.createdAt);

    // Format messages for the chat
    const formattedMessages = conversationMessages.map(msg => ({
      id: msg.id.toString(),
      role: msg.role,
      content: msg.content
    }));

    return new Response(JSON.stringify(formattedMessages), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Failed to fetch messages:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to fetch messages' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
} 