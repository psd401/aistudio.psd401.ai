import { NextRequest, NextResponse } from 'next/server';
import { getAuth, clerkClient } from '@clerk/nextjs/server';
import { db } from '@/db/db';
import { usersTable } from '@/db/schema';
import type { Role } from '@/types';
import { eq } from 'drizzle-orm';
import { hasRole } from '@/utils/roles';
import { badRequest, unauthorized, forbidden, notFound } from '@/lib/api-utils';

export async function PUT(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    const { userId: currentUserId } = getAuth(request);
    // Since Next.js 14.1, params should be explicitly awaited
    const { userId } = await Promise.resolve(params);
    
    if (!currentUserId) {
      return unauthorized();
    }

    // Check if user is administrator
    const isAdmin = await hasRole(currentUserId, 'administrator');
    if (!isAdmin) {
      return forbidden();
    }

    const { role } = await request.json();
    
    if (!role || !['student', 'staff', 'administrator'].includes(role)) {
      return badRequest('Invalid role');
    }

    // Update user role in database
    const [updatedUser] = await db
      .update(usersTable)
      .set({ role: role as Role })
      .where(eq(usersTable.id, parseInt(userId, 10)))
      .returning();

    if (!updatedUser) {
      return notFound('User not found');
    }

    // Safer Clerk client usage with error handling
    try {
      if (updatedUser.clerkId && clerkClient?.users?.updateUserMetadata) {
        await clerkClient.users.updateUserMetadata(updatedUser.clerkId, {
          publicMetadata: {
            role: role
          },
        });
      }
    } catch (clerkError) {
      console.error('Error updating Clerk metadata:', clerkError);
      // Continue with the response even if Clerk update fails
    }

    return NextResponse.json({
      success: true,
      message: 'User role updated successfully',
      data: updatedUser
    });
  } catch (error) {
    console.error('Error updating user role:', error);
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : 'Failed to update user role' },
      { status: 500 }
    );
  }
}