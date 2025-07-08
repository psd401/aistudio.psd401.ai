import { NextRequest, NextResponse } from 'next/server';
import { updateUserRole } from '@/lib/db/data-api-adapter';
import { getServerSession } from '@/lib/auth/server-session';

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ userId: string }> }
) {
  try {
    // Await the params object before using it
    const params = await context.params;
    const userIdString = params.userId;
    
    // Check authorization
    const session = await getServerSession()
    
    if (!session) {
      return NextResponse.json(
        { isSuccess: false, message: 'Unauthorized' },
        { status: 401 }
      );
    }

    // TODO: Implement proper admin check with Amplify

    const body = await request.json();
    const { role: newRole } = body;
    
    if (!newRole || typeof newRole !== 'string') {
      return NextResponse.json(
        { isSuccess: false, message: 'Invalid role' },
        { status: 400 }
      );
    }
    
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