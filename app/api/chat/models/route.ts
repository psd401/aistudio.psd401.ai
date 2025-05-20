import { NextResponse } from 'next/server';
import { db } from '@/db/db';
import { aiModelsTable } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { getAuth } from '@clerk/nextjs/server';
import { withErrorHandling, unauthorized } from '@/lib/api-utils';

export async function GET(request: Request) {
  const { userId } = getAuth(request);
  if (!userId) {
    return unauthorized('User not authenticated');
  }

  return withErrorHandling(async () => {
    const models = await db.select()
      .from(aiModelsTable)
      .where(
        and(
          eq(aiModelsTable.active, true),
          eq(aiModelsTable.provider, 'amazon-bedrock')
        )
      )
      .orderBy(aiModelsTable.name);

    return models;
  });
} 