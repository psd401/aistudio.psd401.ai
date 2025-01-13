import { NextResponse } from 'next/server';
import { getAuth } from '@clerk/nextjs/server';
import { db } from '~/lib/db';
import { ideas } from '~/lib/schema';
import { eq } from 'drizzle-orm';

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { userId } = getAuth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { status } = await request.json();
    const ideaId = parseInt(params.id);

    const updatedIdea = await db
      .update(ideas)
      .set({
        status,
        ...(status === 'completed' ? { completedBy: userId, completedAt: new Date() } : {}),
      })
      .where(eq(ideas.id, ideaId))
      .returning();

    return NextResponse.json(updatedIdea[0]);
  } catch (error) {
    console.error('Failed to update idea:', error);
    return NextResponse.json({ error: 'Failed to update idea' }, { status: 500 });
  }
} 