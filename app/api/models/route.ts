import { db } from '@/lib/db';
import { aiModels } from '@/lib/schema';
import { getAuth } from '@clerk/nextjs/server';
import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  const { userId } = getAuth(req);
  if (!userId) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const models = await db
      .select()
      .from(aiModels)
      .where(eq(aiModels.provider, 'amazon-bedrock'))
      .where(eq(aiModels.active, true));
    return Response.json(models);
  } catch (error) {
    console.error('Failed to fetch models:', error);
    return new Response('Failed to fetch models', { status: 500 });
  }
} 