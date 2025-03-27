import { db } from '@/lib/db';
import { conversations, messages } from '@/lib/schema';
import { eq } from 'drizzle-orm';
import { getAuth } from '@clerk/nextjs/server';
import { NextRequest } from 'next/server';

export async function DELETE(
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
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .limit(1);

    if (!conversation.length || conversation[0].clerkId !== userId) {
      return new Response('Not found', { status: 404 });
    }

    await db.transaction(async (tx) => {
      // Delete all messages first
      await tx
        .delete(messages)
        .where(eq(messages.conversationId, conversationId));

      // Then delete the conversation
      await tx
        .delete(conversations)
        .where(eq(conversations.id, conversationId));
    });

    return new Response(null, { status: 204 });
  } catch (error) {
    console.error('Failed to delete conversation:', error);
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
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .limit(1);

    if (!conversation.length || conversation[0].clerkId !== userId) {
      return new Response('Not found', { status: 404 });
    }

    const body = await req.json();
    if (!body.title || typeof body.title !== 'string') {
      return new Response('Invalid title', { status: 400 });
    }

    await db
      .update(conversations)
      .set({ 
        title: body.title.slice(0, 100),
        updatedAt: new Date()
      })
      .where(eq(conversations.id, conversationId));

    return new Response(null, { status: 204 });
  } catch (error) {
    console.error('Failed to update conversation:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to update conversation' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
} 