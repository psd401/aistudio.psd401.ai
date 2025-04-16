import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { hasRole, hasToolAccess } from '@/utils/roles';

export async function GET() {
  try {
    const { userId } = auth();
    if (!userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Check permissions
    const isAdmin = await hasRole(userId, 'administrator');
    const isStaff = await hasRole(userId, 'staff');
    const hasAccessToTool = await hasToolAccess(userId, 'assistant-architect');

    return NextResponse.json({
      success: true,
      auth: { userId },
      permissions: {
        isAdmin,
        isStaff,
        hasAccessToTool
      },
      message: 'If you can see this, you are authenticated'
    });
  } catch (error) {
    console.error('Error in permissions test:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
} 