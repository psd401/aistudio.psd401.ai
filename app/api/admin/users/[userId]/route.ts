import { NextResponse } from 'next/server';
import { deleteUser } from '@/lib/db/data-api-adapter';
import { requireAdmin } from '@/lib/auth/admin-check';
import logger from '@/lib/logger';

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ userId: string }> }
) {
  try {
    // Check admin authorization
    const authError = await requireAdmin();
    if (authError) return authError;

    // Await and validate the params object
    const params = await context.params;
    const targetUserId = params.userId;
    
    if (!targetUserId) {
      return NextResponse.json(
        { isSuccess: false, message: 'Invalid user ID' },
        { status: 400 }
      );
    }

    // Delete the user via Data API
    const deletedUser = await deleteUser(parseInt(targetUserId));

    if (!deletedUser) {
      return NextResponse.json(
        { isSuccess: false, message: 'User not found' },
        { status: 404 }
      );
    }

    // TODO: Also delete from Cognito when we have proper integration

    return NextResponse.json({
      isSuccess: true,
      message: 'User deleted successfully',
      data: deletedUser
    });
  } catch (error) {
    logger.error('Error deleting user:', error);
    return NextResponse.json(
      { 
        isSuccess: false, 
        message: error instanceof Error 
          ? `Failed to delete user: ${error.message}` 
          : 'Failed to delete user'
      },
      { status: 500 }
    );
  }
} 