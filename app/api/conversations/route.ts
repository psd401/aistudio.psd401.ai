import { db } from '@/db/db';
import { conversationsTable } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { getAuth } from '@clerk/nextjs/server';
import { NextRequest } from 'next/server';
import { withErrorHandling, unauthorized } from '@/lib/api-utils';

export async function GET(req: NextRequest) {
  const auth = getAuth(req);
  const { userId } = auth;
  
  if (!userId) {
    return unauthorized('User not authenticated');
  }

  return withErrorHandling(async () => {
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

    return userConversations;
  });
} 