import { NextRequest, NextResponse } from 'next/server';
import { currentUser, clerkClient } from '@clerk/nextjs/server';
import { db } from '~/lib/db';
import { users } from '~/lib/schema';
import type { Role } from '~/lib/schema';
import { eq } from 'drizzle-orm';
import { hasRole } from '~/utils/roles';

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ userId: string }> }
) {
  const params = await context.params;
  const user = await currentUser();
  
  if (!user) {
    console.log('No user found in request');
    return new NextResponse('Unauthorized', { status: 401 });
  }

  // Check if user is administrator
  const isAdmin = await hasRole(user.id, 'administrator');
  if (!isAdmin) {
    console.log('User not administrator:', { userId: user.id });
    return new NextResponse('Forbidden', { status: 403 });
  }

  try {
    const { role } = await request.json();
    
    if (!role || !['student', 'staff', 'administrator'].includes(role)) {
      return new NextResponse('Invalid role', { status: 400 });
    }

    // Update user role in database
    const [updatedUser] = await db
      .update(users)
      .set({ role: role as Role })
      .where(eq(users.clerkId, params.userId))
      .returning();

    if (!updatedUser) {
      return new NextResponse('User not found', { status: 404 });
    }

    // Sync the role with Clerk
    const client = await clerkClient();
    await client.users.updateUserMetadata(params.userId, {
      publicMetadata: {
        role: role
      },
    });

    return NextResponse.json(updatedUser);
  } catch (error) {
    console.error('Error updating user role:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
} 