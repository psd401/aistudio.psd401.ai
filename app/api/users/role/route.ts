import { auth } from '@clerk/nextjs/server';
import { db } from '~/lib/db';
import { users } from '~/lib/schema';
import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const { userId } = auth();
  
  if (!userId) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  // Check if current user is admin
  const currentUser = await db.query.users.findFirst({
    where: eq(users.clerkId, userId),
  });

  if (!currentUser || currentUser.role !== 'Admin') {
    return new NextResponse('Forbidden', { status: 403 });
  }

  try {
    const { targetUserId, role } = await request.json();

    if (!targetUserId || !role || !['Admin', 'Staff'].includes(role)) {
      return new NextResponse('Invalid request', { status: 400 });
    }

    const [updatedUser] = await db
      .update(users)
      .set({ role })
      .where(eq(users.clerkId, targetUserId))
      .returning();

    return NextResponse.json(updatedUser);
  } catch (error) {
    console.error('Error updating user role:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
} 