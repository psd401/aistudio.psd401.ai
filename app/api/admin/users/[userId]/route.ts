import { NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { db } from '@/db/db';
import { usersTable } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { withErrorHandling, unauthorized, forbidden, notFound, badRequest } from '@/lib/api-utils';
import { z } from 'zod';
import { createError } from '@/lib/error-utils';

// Route parameter validation schema
const ParamsSchema = z.object({
  userId: z.string().regex(/^\d+$/, 'User ID must be a positive integer').transform(Number)
});

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
    // Await and validate the params object
    const params = await context.params;
    const validationResult = ParamsSchema.safeParse(params);
    
    if (!validationResult.success) {
      throw createError('Invalid user ID parameter', {
        code: 'VALIDATION',
        level: 'warn',
        details: { 
          userId: params.userId,
          errors: validationResult.error.errors 
        }
      });
    }
    
    const targetUserId = validationResult.data.userId;

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