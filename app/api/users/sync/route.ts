import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { syncUserWithClerk } from '@/utils/users';

export async function POST() {
  const { userId } = await auth();
  
  if (!userId) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  try {
    const user = await syncUserWithClerk(userId);
    return NextResponse.json(user);
  } catch (error) {
    console.error('Error in sync endpoint:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
} 