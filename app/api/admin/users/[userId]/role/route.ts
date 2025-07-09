import { NextRequest, NextResponse } from 'next/server';
import { updateUserRole } from '@/lib/db/data-api-adapter';
import { requireAdmin } from '@/lib/auth/admin-check';
import { validateRequest, updateUserRoleSchema } from '@/lib/validations/api-schemas';

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ userId: string }> }
) {
  try {
    // Await the params object before using it
    const params = await context.params;
    const userIdString = params.userId;
    
    // Check admin authorization
    const authError = await requireAdmin();
    if (authError) return authError;

    // Validate request body
    const { data: validatedData, error } = await validateRequest(request, updateUserRoleSchema);
    if (error) {
      return NextResponse.json(
        { isSuccess: false, message: error },
        { status: 400 }
      );
    }
    const { role: newRole } = validatedData!;
    
    // Update the user's role via Data API
    const userId = parseInt(userIdString, 10);
    if (isNaN(userId)) {
      return NextResponse.json(
        { isSuccess: false, message: 'Invalid user ID' },
        { status: 400 }
      );
    }
    await updateUserRole(userId, newRole);

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