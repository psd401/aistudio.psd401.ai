import { db } from '@/db/db';
import { conversationsTable } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { getAuth } from '@clerk/nextjs/server';
import { NextRequest } from 'next/server';

export async function GET(req: NextRequest) {
  const auth = getAuth(req);
  const { userId } = auth;
  
  if (!userId) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const userConversations = await db
      .select()
      .from(conversationsTable)
      .where(
        and(
          eq(conversationsTable.clerkId, userId),
          eq(conversationsTable.source, "chat")
        )
      )
      .orderBy(conversationsTable.updatedAt);

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