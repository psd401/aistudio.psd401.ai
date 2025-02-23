import { NextRequest, NextResponse } from 'next/server';
import { getAuth, clerkClient } from '@clerk/nextjs/server';
import { db } from '@/db/db';
import { usersTable } from '@/db/schema';
import type { Role } from '@/types';
import { eq } from 'drizzle-orm';
import { hasRole } from '@/utils/roles';

export async function PUT(
  request: NextRequest,
  context: { params: { userId: string } }
) {
  const { userId } = getAuth();
  
  if (!userId) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  // Check if user is administrator
  const isAdmin = await hasRole(userId, 'administrator');
  if (!isAdmin) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  try {
    const { role } = await request.json();
    
    if (!role || !['student', 'staff', 'administrator'].includes(role)) {
      return new NextResponse('Invalid role', { status: 400 });
    }

    // Update user role in database
    const [updatedUser] = await db
      .update(usersTable)
      .set({ role: role as Role })
      .where(eq(usersTable.id, parseInt(context.params.userId)))
      .returning();

    if (!updatedUser) {
      return new NextResponse('User not found', { status: 404 });
    }

    // Sync the role with Clerk
    await clerkClient.users.updateUserMetadata(updatedUser.clerkId, {
      publicMetadata: {
        role: role
      },
    });

    return NextResponse.json({
      isSuccess: true,
      message: 'User role updated successfully',
      data: updatedUser
    });
  } catch (error) {
    console.error('Error updating user role:', error);
    return NextResponse.json(
      { isSuccess: false, message: 'Failed to update user role' },
      { status: 500 }
    );
  }
} 