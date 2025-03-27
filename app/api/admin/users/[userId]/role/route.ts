import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from '@clerk/nextjs/server';
import { db } from '@/db/db';
import { userRolesTable, rolesTable } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { hasRole } from '@/utils/roles';
import { badRequest, unauthorized, forbidden, notFound } from '@/lib/api-utils';

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ userId: string }> }
) {
  try {
    // Await the params object before using it
    const params = await context.params;
    const userIdString = params.userId;
    
    const { userId: adminId } = getAuth(request);
    if (!adminId) {
      return NextResponse.json(
        { isSuccess: false, message: 'Unauthorized' },
        { status: 401 }
      );
    }

    const isAdmin = await hasRole(adminId, 'administrator');
    if (!isAdmin) {
      return NextResponse.json(
        { isSuccess: false, message: 'Forbidden - Admin access required' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { role: newRole } = body;
    
    console.log('Role update request:', { userId: userIdString, newRole, body });
    
    if (!newRole || typeof newRole !== 'string') {
      return NextResponse.json(
        { isSuccess: false, message: 'Invalid role' },
        { status: 400 }
      );
    }
    
    // Ensure we have a numeric user ID
    const userId = parseInt(userIdString);
    if (isNaN(userId)) {
      return NextResponse.json(
        { isSuccess: false, message: 'Invalid user ID' },
        { status: 400 }
      );
    }

    // Get the role ID for the new role
    const [roleRecord] = await db
      .select()
      .from(rolesTable)
      .where(eq(rolesTable.name, newRole));

    console.log('Found role record:', roleRecord);

    if (!roleRecord) {
      return NextResponse.json(
        { isSuccess: false, message: 'Invalid role' },
        { status: 400 }
      );
    }

    // Delete existing roles for the user
    await db
      .delete(userRolesTable)
      .where(eq(userRolesTable.userId, userId));

    // Insert the new role
    await db
      .insert(userRolesTable)
      .values({
        userId: userId,
        roleId: roleRecord.id
      });

    return NextResponse.json({
      isSuccess: true,
      message: 'User role updated successfully'
    });
  } catch (error) {
    console.error('Error updating user role:', error);
    return NextResponse.json(
      { 
        isSuccess: false, 
        message: error instanceof Error 
          ? `Failed to update user role: ${error.message}` 
          : 'Failed to update user role'
      },
      { status: 500 }
    );
  }
}