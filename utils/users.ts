import { clerkClient, currentUser } from '@clerk/nextjs/server';
import { db } from '@/db/db';
import { usersTable } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function syncUserWithClerk(userId: string) {
  try {
    // Get user from Clerk
    const client = await clerkClient();
    const clerkUser = await client.users.getUser(userId);

    // Get user from database
    const [dbUser] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.clerkId, userId));

    const userData = {
      clerkId: userId,
      firstName: clerkUser.firstName || null,
      lastName: clerkUser.lastName || null,
      role: dbUser?.role || 'student', // Preserve existing role or default to student
    };

    if (!dbUser) {
      // Create new user if they don't exist
      const [newUser] = await db
        .insert(usersTable)
        .values(userData)
        .returning();
      return newUser;
    } else {
      // Update existing user
      const [updatedUser] = await db
        .update(usersTable)
        .set(userData)
        .where(eq(usersTable.clerkId, userId))
        .returning();
      return updatedUser;
    }
  } catch (error) {
    console.error('Error syncing user with Clerk:', error);
    throw error;
  }
} 