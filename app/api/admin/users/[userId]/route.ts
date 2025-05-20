import { NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { db } from '@/db/db';
import { usersTable } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { withErrorHandling, unauthorized, forbidden, notFound, badRequest } from '@/lib/api-utils';

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ userId: string }> }
) {
  const { userId: adminId } = auth();
  
  if (!adminId) {
    return unauthorized('User not authenticated');
  }

  // Check if user is admin
  const [adminUser] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.clerkId, adminId));

  if (!adminUser || adminUser.role !== 'Admin') {
    return forbidden('Only administrators can delete users');
  }

  return withErrorHandling(async () => {
    // Await the params object before using it
    const params = await context.params;
    const targetUserId = parseInt(params.userId);
    if (isNaN(targetUserId)) {
      throw new Error('Invalid user ID');
    }

    // Get user from our database
    const [targetUser] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, targetUserId));

    if (!targetUser) {
      return notFound('User not found');
    }

    // Delete from Clerk first
    await clerkClient.users.deleteUser(targetUser.clerkId);

    // Then delete from our database
    await db.delete(usersTable).where(eq(usersTable.id, targetUserId));

    return null;
  });
} 