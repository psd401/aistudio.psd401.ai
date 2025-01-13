import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs';
import { db } from '~/lib/db';
import { ideas, Idea } from '~/lib/schema';
import { eq } from 'drizzle-orm';

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { userId } = auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { status } = await request.json();
    const ideaId = parseInt(params.id);

    const updatedIdea = await db
      .update(Idea)
      .set({
        status,
        ...(status === 'completed' ? { completedBy: userId, completedAt: new Date() } : {}),
      })
      .where(eq(Idea.id, ideaId))
      .returning();

    return NextResponse.json(updatedIdea[0]);
  } catch (error) {
    console.error('Failed to update idea:', error);
    return NextResponse.json({ error: 'Failed to update idea' }, { status: 500 });
  }
} 