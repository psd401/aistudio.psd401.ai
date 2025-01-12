import { currentUser } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { hasRole } from '~/utils/roles';

export async function GET(request: NextRequest) {
  const user = await currentUser();
  
  // Add debug logging
  console.log('Check role request:', { userId: user?.id });
  
  if (!user?.id) {
    console.log('No user found');
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const role = searchParams.get('role');

  if (!role) {
    return new NextResponse('Missing role parameter', { status: 400 });
  }

  try {
    const hasUserRole = await hasRole(user.id, role);
    console.log('Role check result:', { userId: user.id, role, hasUserRole });
    return NextResponse.json({ hasRole: hasUserRole });
  } catch (error) {
    console.error('Error checking role:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
} 