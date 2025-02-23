import { NextResponse, NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/db/db';
import { ideasTable } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { hasRole } from '@/utils/roles';

export async function PATCH(
  request: NextRequest,
  context: { params: { id: string } }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only staff or admin can edit ideas
    const [isStaff, isAdmin] = await Promise.all([
      hasRole(userId, 'staff'),
      hasRole(userId, 'administrator')
    ]);
    if (!isStaff && !isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { id } = context.params;
    const ideaId = parseInt(id);

    // Allow updating title, description, priority level, and status
    const updateData: any = {
      ...(body.title && { title: body.title }),
      ...(body.description && { description: body.description }),
      ...(body.priorityLevel && { priorityLevel: body.priorityLevel }),
      ...(body.status && { 
        status: body.status,
        ...(body.status === 'completed' ? { 
          completedBy: userId, 
          completedAt: new Date() 
        } : {})
      })
    };

    const [updatedIdea] = await db
      .update(ideasTable)
      .set(updateData)
      .where(eq(ideasTable.id, ideaId))
      .returning();

    return NextResponse.json(updatedIdea);
  } catch (error) {
    console.error('Failed to update idea:', error);
    return NextResponse.json({ error: 'Failed to update idea' }, { status: 500 });
  }
} 