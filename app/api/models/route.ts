import { db } from '@/db/db';
import { aiModelsTable } from '@/db/schema';
import { getAuth } from '@clerk/nextjs/server';
import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  console.log('[GET /api/models] Starting request');
  
  const { userId } = getAuth(req);
  console.log('[GET /api/models] Auth:', { userId });
  
  if (!userId) {
    console.log('[GET /api/models] Unauthorized - no userId');
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    console.log('[GET /api/models] Fetching models from database...');
    const models = await db
      .select()
      .from(aiModelsTable)
      .where(eq(aiModelsTable.provider, 'amazon-bedrock'))
      .where(eq(aiModelsTable.active, true))
      .where(eq(aiModelsTable.chatEnabled, true));
    
    console.log('[GET /api/models] Found chat-enabled models:', models);
    return Response.json(models);
  } catch (error) {
    console.error('[GET /api/models] Error fetching models:', error);
    return new Response('Failed to fetch models', { status: 500 });
  }
} 