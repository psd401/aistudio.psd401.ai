import { clerkClient } from '@clerk/nextjs/server';
import { db } from '~/lib/db';
import { users } from '~/lib/schema';
import type { Role } from '~/lib/schema';
import { eq } from 'drizzle-orm';

const roleHierarchy: Record<Role, number> = {
  student: 0,
  staff: 1,
  administrator: 2
};

export async function syncUserRole(userId: string) {
  // Get user from database
  const dbUser = await db.query.users.findFirst({
    where: eq(users.clerkId, userId),
  });

  // Get user from Clerk
  const client = await clerkClient();
  const clerkUser = await client.users.getUser(userId);
  const clerkRole = clerkUser.publicMetadata.role as Role | undefined;

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

export async function hasRole(userId: string, role: Role): Promise<boolean> {
  const dbUser = await db.query.users.findFirst({
    where: eq(users.clerkId, userId),
  });

  if (!dbUser?.role) return false;

  // Check if user's role is at least as high as the required role in the hierarchy
  return roleHierarchy[dbUser.role] >= roleHierarchy[role as Role];
}

export async function hasExactRole(userId: string, role: Role): Promise<boolean> {
  const dbUser = await db.query.users.findFirst({
    where: eq(users.clerkId, userId),
  });

  return dbUser?.role?.toLowerCase() === role.toLowerCase();
} 