import { NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { users } from '@/lib/schema';
import { desc } from 'drizzle-orm';

export async function GET() {
  const { userId } = auth();
  
  if (!userId) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  // Check if user is admin
  const adminUser = await db.query.users.findFirst({
    where: (users, { eq }) => eq(users.clerkId, userId),
  });

  if (!adminUser || adminUser.role !== 'Admin') {
    return new NextResponse('Forbidden', { status: 403 });
  }

  try {
    // Get all users from our database
    const dbUsers = await db.select().from(users).orderBy(desc(users.createdAt));
    
    // Get all users from Clerk
    const clerkUsers = await clerkClient.users.getUserList();
    
    // Merge the data
    const mergedUsers = dbUsers.map(dbUser => {
      const clerkUser = clerkUsers.find(cu => cu.id === dbUser.clerkId);
      return {
        ...dbUser,
        firstName: clerkUser?.firstName ?? '',
        lastName: clerkUser?.lastName ?? '',
        email: clerkUser?.emailAddresses[0]?.emailAddress ?? '',
        lastSignInAt: clerkUser?.lastSignInAt ?? null,
      };
    });

    return NextResponse.json(mergedUsers);
  } catch (error) {
    console.error('Error fetching users:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
} 