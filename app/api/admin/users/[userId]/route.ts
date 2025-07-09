import { NextResponse } from 'next/server';
import { deleteUser, hasUserRole } from '@/lib/db/data-api-adapter';
import { getServerSession } from '@/lib/auth/server-session';

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ userId: string }> }
) {
  try {
    // Check authorization
    const session = await getServerSession()
    
    if (!session) {
      return NextResponse.json(
        { isSuccess: false, message: 'Unauthorized' },
        { status: 401 }
      );
    }

    // TODO: Implement proper admin check with Amplify
    // For now, we'll skip the admin check to test functionality

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
    const deletedUser = await deleteUser(targetUserId);

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
    console.error('Error deleting user:', error);
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