import { clerkClient, currentUser } from '@clerk/nextjs/server';
import { db } from '@/db/db';
import { usersTable, rolesTable, userRolesTable } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function syncUserWithClerk(userId: string) {
  try {
    // Get user from Clerk
    const client = await clerkClient();
    const clerkUser = await client.users.getUser(userId);

    // Get primary email address from Clerk
    const primaryEmail = clerkUser.emailAddresses.find(
      email => email.id === clerkUser.primaryEmailAddressId
    )?.emailAddress || '';

    // Get user from database
    const [dbUser] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.clerkId, userId));

    const userData = {
      clerkId: userId,
      firstName: clerkUser.firstName || null,
      lastName: clerkUser.lastName || null,
      email: primaryEmail,
      lastSignInAt: clerkUser.lastSignInAt ? new Date(clerkUser.lastSignInAt) : null,
    };

    let user;
    if (!dbUser) {
      // Create new user if they don't exist
      const [newUser] = await db
        .insert(usersTable)
        .values(userData)
        .returning();
      user = newUser;

      // Get the staff role ID
      const [staffRole] = await db
        .select()
        .from(rolesTable)
        .where(eq(rolesTable.name, 'staff'));

      if (staffRole) {
        // Assign staff role to new user
        await db
          .insert(userRolesTable)
          .values({
            userId: newUser.id,
            roleId: staffRole.id
          })
          .onConflictDoNothing();
      }
    } else {
      // Update existing user
      const [updatedUser] = await db
        .update(usersTable)
        .set(userData)
        .where(eq(usersTable.clerkId, userId))
        .returning();
      user = updatedUser;
    }

    return user;
  } catch (error) {
    console.error('Error syncing user with Clerk:', error);
    throw error;
  }
} 