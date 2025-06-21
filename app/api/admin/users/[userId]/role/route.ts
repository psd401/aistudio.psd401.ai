import { NextRequest, NextResponse } from 'next/server';
import { updateUserRole } from '@/lib/db/data-api-adapter';
import { cookies } from 'next/headers';

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ userId: string }> }
) {
  try {
    // Await the params object before using it
    const params = await context.params;
    const userIdString = params.userId;
    
    // Check authorization - temporary solution
    const cookieStore = await cookies()
    const hasAuthCookie = cookieStore.has('CognitoIdentityServiceProvider.3409udcdkhvqbs5njab7do8fsr.LastAuthUser')
    
    if (!hasAuthCookie) {
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
    await updateUserRole(userIdString, newRole);

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