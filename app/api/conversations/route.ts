import { db } from '@/lib/db';
import { conversations } from '@/lib/schema';
import { eq } from 'drizzle-orm';
import { getAuth } from '@clerk/nextjs/server';
import { NextRequest } from 'next/server';

export async function GET(req: NextRequest) {
  const { userId } = getAuth(req);
  if (!userId) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const userConversations = await db
      .select()
      .from(conversations)
      .where(eq(conversations.clerkId, userId))
      .orderBy(conversations.updatedAt);

    return new Response(JSON.stringify(userConversations), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Failed to fetch conversations:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to fetch conversations' }), 
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
} 