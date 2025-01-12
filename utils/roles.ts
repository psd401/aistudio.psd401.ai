import { clerkClient } from '@clerk/nextjs/server';
import { db } from '~/lib/db';
import { users } from '~/lib/schema';
import { eq } from 'drizzle-orm';

export async function syncUserRole(userId: string) {
  // Get user from database
  const dbUser = await db.query.users.findFirst({
    where: eq(users.clerkId, userId),
  });

  // Get user from Clerk
  const client = await clerkClient();
  const clerkUser = await client.users.getUser(userId);
  const clerkRole = clerkUser.publicMetadata.role as string | undefined;

  // If user exists in DB but not in Clerk, sync DB -> Clerk
  if (dbUser && !clerkRole) {
    await client.users.updateUserMetadata(userId, {
      publicMetadata: {
        role: dbUser.role,
      },
    });
    return dbUser.role;
  }

  // If user exists in Clerk but not in DB, sync Clerk -> DB
  if (!dbUser && clerkRole) {
    const [newUser] = await db
      .insert(users)
      .values({
        clerkId: userId,
        role: clerkRole,
      })
      .returning();
    return newUser.role;
  }

  // If user exists in both places but roles don't match, prefer DB
  if (dbUser && clerkRole && dbUser.role !== clerkRole) {
    await client.users.updateUserMetadata(userId, {
      publicMetadata: {
        role: dbUser.role,
      },
    });
    return dbUser.role;
  }

  return dbUser?.role;
}

export async function hasRole(userId: string, role: string): Promise<boolean> {
  const dbUser = await db.query.users.findFirst({
    where: eq(users.clerkId, userId),
  });

  // Add debug logging
  console.log('Checking role:', {
    userId,
    requestedRole: role,
    userRole: dbUser?.role,
    hasRole: dbUser?.role?.toLowerCase() === role.toLowerCase()
  });

  // Case-insensitive comparison
  return dbUser?.role?.toLowerCase() === role.toLowerCase();
} 