import { NextResponse } from 'next/server';
import { getAuth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { messages, conversations } from '@/lib/schema';
import { eq, and } from 'drizzle-orm';

export async function GET(
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

    // Fetch messages for the conversation
    const conversationMessages = await db.query.messages.findMany({
      where: eq(messages.conversationId, conversationIdNum),
      orderBy: (messages, { asc }) => [asc(messages.createdAt)],
    });

    return NextResponse.json(conversationMessages);
  } catch (error) {
    console.error('Error fetching messages:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
} 