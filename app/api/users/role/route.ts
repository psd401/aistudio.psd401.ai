import { auth } from '@clerk/nextjs/server';
import { db } from '@/db/db';
import { usersTable } from '@/db/schema';
import type { Role } from '@/types';
import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { hasRole } from '@/utils/roles';

export async function POST(request: Request) {
  const { userId } = auth();
  
  if (!userId) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  // Check if current user is administrator
  const isAdmin = await hasRole(userId, 'administrator');
  if (!isAdmin) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  try {
    const { targetUserId, role } = await request.json();

    if (!targetUserId || !role || !['student', 'staff', 'administrator'].includes(role)) {
      return new NextResponse('Invalid request', { status: 400 });
    }

    const [updatedUser] = await db
      .update(usersTable)
      .set({ role: role as Role })
      .where(eq(usersTable.clerkId, targetUserId))
      .returning();

    return NextResponse.json(updatedUser);
  } catch (error) {
    console.error('Error updating user role:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
} 