import { NextResponse, NextRequest } from 'next/server';
import { getAuth } from '@clerk/nextjs/server';
import { db } from '@/db/db';
import { ideasTable } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { userId } = getAuth(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { status } = await request.json();
    const ideaId = parseInt(params.id);

    const updatedIdea = await db
      .update(ideasTable)
      .set({
        status,
        ...(status === 'completed' ? { completedBy: userId, completedAt: new Date() } : {}),
      })
      .where(eq(ideasTable.id, ideaId))
      .returning();

    return NextResponse.json(updatedIdea[0]);
  } catch (error) {
    console.error('Failed to update idea:', error);
    return NextResponse.json({ error: 'Failed to update idea' }, { status: 500 });
  }
} 