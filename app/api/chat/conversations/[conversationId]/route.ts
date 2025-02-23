import { getAuth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { conversations, messages } from '@/lib/schema';
import { eq, and, asc } from 'drizzle-orm';

export async function GET(
  req: NextRequest,
  { params }: { params: { conversationId: string } }
) {
  const { userId } = getAuth(req);
  
  if (!userId) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  try {
    const conversationId = parseInt(params.conversationId);
    
    // First get the conversation
    const [conversation] = await db
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.id, conversationId),
          eq(conversations.clerkId, userId)
        )
      );

    if (!conversation) {
      return new NextResponse('Not Found', { status: 404 });
    }

    // Then get the messages
    const conversationMessages = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(asc(messages.createdAt));

    return NextResponse.json({ ...conversation, messages: conversationMessages });
  } catch (error) {
    console.error('Error fetching conversation:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { conversationId: string } }
) {
  const { userId } = getAuth(req);
  
  if (!userId) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  try {
    const conversationId = parseInt(params.conversationId);
    const { title } = await req.json();

    const [conversation] = await db
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.id, conversationId),
          eq(conversations.clerkId, userId)
        )
      );

    if (!conversation) {
      return new NextResponse('Not Found', { status: 404 });
    }

    const [updatedConversation] = await db
      .update(conversations)
      .set({ title, updatedAt: new Date() })
      .where(eq(conversations.id, conversationId))
      .returning();

    return NextResponse.json(updatedConversation);
  } catch (error) {
    console.error('Error updating conversation:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { conversationId: string } }
) {
  const { userId } = getAuth(req);
  
  if (!userId) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  try {
    const conversationId = parseInt(params.conversationId);
    
    const [conversation] = await db
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.id, conversationId),
          eq(conversations.clerkId, userId)
        )
      );

    if (!conversation) {
      return new NextResponse('Not Found', { status: 404 });
    }

    // Delete all messages first
    await db
      .delete(messages)
      .where(eq(messages.conversationId, conversationId));

    // Then delete the conversation
    await db
      .delete(conversations)
      .where(eq(conversations.id, conversationId));

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('Error deleting conversation:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
} 