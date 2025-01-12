import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { users } from '@/lib/schema';
import { eq } from 'drizzle-orm';

export async function PUT(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  const { userId: adminId } = auth();
  
  if (!adminId) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  // Check if user is admin
  const adminUser = await db.query.users.findFirst({
    where: (users, { eq }) => eq(users.clerkId, adminId),
  });

  if (!adminUser || adminUser.role !== 'Admin') {
    return new NextResponse('Forbidden', { status: 403 });
  }

  try {
    const { role } = await request.json();
    
    if (!role || !['Admin', 'Staff', 'User'].includes(role)) {
      return new NextResponse('Invalid role', { status: 400 });
    }

    const targetUserId = parseInt(params.userId);
    if (isNaN(targetUserId)) {
      return new NextResponse('Invalid user ID', { status: 400 });
    }

    // Update user role
    const updatedUser = await db
      .update(users)
      .set({ role })
      .where(eq(users.id, targetUserId))
      .returning();

    if (!updatedUser.length) {
      return new NextResponse('User not found', { status: 404 });
    }

    return NextResponse.json(updatedUser[0]);
  } catch (error) {
    console.error('Error updating user role:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
} 