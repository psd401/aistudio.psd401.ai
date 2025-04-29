import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { aiModelsTable } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { getAuth } from '@clerk/nextjs/server';

export async function GET(request: Request) {
  try {
    const { userId } = getAuth(request);
    if (!userId) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const models = await db.select()
      .from(aiModelsTable)
      .where(
        and(
          eq(aiModelsTable.active, true),
          eq(aiModelsTable.provider, 'amazon-bedrock')
        )
      )
      .orderBy(aiModelsTable.name);

    return NextResponse.json(models);
  } catch (error) {
    console.error('Error fetching active AI models:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
} 