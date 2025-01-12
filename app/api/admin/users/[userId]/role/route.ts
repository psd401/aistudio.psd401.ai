import { NextRequest, NextResponse } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';
import { db } from '~/lib/db';
import { users } from '~/lib/schema';
import { eq } from 'drizzle-orm';

export async function PUT(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  const user = await currentUser();
  
  if (!user) {
    console.log('No user found in request');
    return new NextResponse('Unauthorized', { status: 401 });
  }

  // Check if user is admin
  const adminUser = await db.query.users.findFirst({
    where: eq(users.clerkId, user.id),
  });

  if (!adminUser || adminUser.role !== 'Admin') {
    console.log('User not admin:', { userId: user.id, role: adminUser?.role });
    return new NextResponse('Forbidden', { status: 403 });
  }

  try {
    const { role } = await request.json();
    
    if (!role || !['Admin', 'Staff'].includes(role)) {
      return new NextResponse('Invalid role', { status: 400 });
    }

    // Update user role
    const [updatedUser] = await db
      .update(users)
      .set({ role })
      .where(eq(users.clerkId, params.userId))
      .returning();

    if (!updatedUser) {
      return new NextResponse('User not found', { status: 404 });
    }

    return NextResponse.json(updatedUser);
  } catch (error) {
    console.error('Error updating user role:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
} 