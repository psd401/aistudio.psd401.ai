import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { db } from '@/db/db';
import { usersTable } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { syncUserRole, hasRole } from '@/utils/roles';
import { withErrorHandling, unauthorized, forbidden } from '@/lib/api-utils';
import { createError } from '@/lib/error-utils';

export async function POST(request: Request) {
  const { userId } = auth();
  if (!userId) {
    return unauthorized('User not authenticated');
  }

  return withErrorHandling(async () => {
    // SECURITY: Only existing administrators can promote users
    const isAdmin = await hasRole(userId, 'administrator');
    if (!isAdmin) {
      throw createError('Only administrators can promote users to administrator role', {
        code: 'FORBIDDEN',
        level: 'warn',
        details: { userId, action: 'promote_user' }
      });
    }

    // Get the target user ID from request body
    const body = await request.json();
    const { targetUserId } = body;

    if (!targetUserId) {
      throw createError('Target user ID is required', {
        code: 'VALIDATION',
        level: 'warn',
        details: { field: 'targetUserId' }
      });
    }

    // Update target user role to administrator
    const [updatedUser] = await db
      .update(usersTable)
      .set({ role: 'administrator' })
      .where(eq(usersTable.clerkId, targetUserId))
      .returning();

    if (!updatedUser) {
      throw createError('User not found', {
        code: 'NOT_FOUND',
        level: 'warn',
        details: { targetUserId }
      });
    }

    // Sync the role with Clerk
    await syncUserRole(targetUserId);

    return {
      success: true,
      user: updatedUser
    };
  });
} 