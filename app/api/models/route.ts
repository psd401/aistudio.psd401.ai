import { getAuth } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';

import { withErrorHandling, unauthorized } from '@/lib/api-utils';
import { createError } from '@/lib/error-utils';
import { db } from '@/db/db';
import { aiModelsTable } from '@/db/schema';

export async function GET(req: NextRequest) {
  console.log('[GET /api/models] Starting request');
  
  const { userId } = getAuth(req);
  console.log('[GET /api/models] Auth:', { userId });
  
  if (!userId) {
    console.log('[GET /api/models] Unauthorized - no userId');
    return unauthorized('User not authenticated');
  }

  return withErrorHandling(async () => {
    console.log('[GET /api/models] Fetching models from database...');
    const models = await db
      .select()
      .from(aiModelsTable)
      .where(eq(aiModelsTable.provider, 'amazon-bedrock'))
      .where(eq(aiModelsTable.active, true))
      .where(eq(aiModelsTable.chatEnabled, true));
    
    console.log('[GET /api/models] Found chat-enabled models:', models);
    return models;
  });
}