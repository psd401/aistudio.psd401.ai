import { NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { users } from '@/lib/schema';
import { eq } from 'drizzle-orm';

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ userId: string }> }
) {
  const { userId: adminId } = auth();
  
  if (!adminId) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  // Check if user is admin
  const [adminUser] = await db
    .select()
    .from(users)
    .where(eq(users.clerkId, adminId));

  if (!adminUser || adminUser.role !== 'Admin') {
    return new NextResponse('Forbidden', { status: 403 });
  }

  try {
    // Await the params object before using it
    const params = await context.params;
    const targetUserId = parseInt(params.userId);
    if (isNaN(targetUserId)) {
      return new NextResponse('Invalid user ID', { status: 400 });
    }

    // Get user from our database
    const [targetUser] = await db
      .select()
      .from(users)
      .where(eq(users.id, targetUserId));

    if (!targetUser) {
      return new NextResponse('User not found', { status: 404 });
    }

    // Delete from Clerk first
    await clerkClient.users.deleteUser(targetUser.clerkId);

    // Then delete from our database
    await db.delete(users).where(eq(users.id, targetUserId));

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('Error deleting user:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
} 