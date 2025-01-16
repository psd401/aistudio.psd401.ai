import { NextRequest, NextResponse } from 'next/server';
import { currentUser, clerkClient } from '@clerk/nextjs/server';
import { hasRole } from '~/utils/roles';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ userId: string }> }
) {
  const params = await context.params;
  const user = await currentUser();
  
  if (!user) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  // Check if user is administrator
  const isAdmin = await hasRole(user.id, 'administrator');
  if (!isAdmin) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  try {
    const client = await clerkClient();
    const clerkUser = await client.users.getUser(params.userId);
    
    return NextResponse.json({
      firstName: clerkUser.firstName,
      lastName: clerkUser.lastName,
      emailAddresses: clerkUser.emailAddresses
    });
  } catch (error) {
    console.error('Error fetching user details:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
} 