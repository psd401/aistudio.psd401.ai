import { NextResponse } from 'next/server';
import { getAuth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { conversations } from '@/lib/schema';
import { eq, and } from 'drizzle-orm';
import { messages } from '@/lib/schema';

export async function PATCH(
  req: Request,
  { params }: { params: { conversationId: string } }
) {
  try {
    const { userId } = getAuth(req);
    const { conversationId } = await params;
    const conversationIdNum = parseInt(conversationId);
    
    if (!userId) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const { title } = await req.json();

    // First verify the conversation belongs to the user
    const conversation = await db.query.conversations.findFirst({
      where: and(
        eq(conversations.id, conversationIdNum),
        eq(conversations.clerkId, userId)
      ),
    });

    if (!conversation) {
      return new NextResponse('Not Found', { status: 404 });
    }

    // Update the conversation
    const [updatedConversation] = await db
      .update(conversations)
      .set({ title, updatedAt: new Date() })
      .where(eq(conversations.id, conversationIdNum))
      .returning();

    return NextResponse.json(updatedConversation);
  } catch (error) {
    console.error('Error updating conversation:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: { conversationId: string } }
) {
  try {
    const { userId } = getAuth(req);
    const { conversationId } = await params;
    const conversationIdNum = parseInt(conversationId);
    
    if (!userId) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    // First verify the conversation belongs to the user
    const conversation = await db.query.conversations.findFirst({
      where: and(
        eq(conversations.id, conversationIdNum),
        eq(conversations.clerkId, userId)
      ),
    });

    if (!conversation) {
      return new NextResponse('Not Found', { status: 404 });
    }

    // First delete all messages associated with this conversation
    await db.delete(messages)
      .where(eq(messages.conversationId, conversationIdNum));

    // Then delete the conversation
    await db.delete(conversations)
      .where(eq(conversations.id, conversationIdNum));

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('Error deleting conversation:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
} 