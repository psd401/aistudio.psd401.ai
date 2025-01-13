import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { db } from '~/lib/db';
import { ideas } from '~/lib/schema';
import { eq } from 'drizzle-orm';
import { hasRole } from '~/utils/roles';

export async function PATCH(request: Request, context: { params: { id: string } }) {
  // Protect route from unauthenticated users
  const { userId } = await auth.protect();

  // Only admins can change status
  const isAdmin = await hasRole(userId, 'Admin');
  if (!isAdmin) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  try {
    const { id } = await Promise.resolve(context.params);
    const ideaId = parseInt(id);
    if (isNaN(ideaId)) {
      return new NextResponse('Invalid idea ID', { status: 400 });
    }

    const { status } = await request.json();
    if (!status) {
      return new NextResponse('Missing status', { status: 400 });
    }

    const updateData: any = {
      status,
      ...(status === 'completed' ? {
        completedBy: userId,
        completedAt: new Date()
      } : {})
    };

    const [updatedIdea] = await db.update(ideas)
      .set(updateData)
      .where(eq(ideas.id, ideaId))
      .returning();

    return NextResponse.json(updatedIdea);
  } catch (error) {
    console.error('Error updating idea status:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
} 