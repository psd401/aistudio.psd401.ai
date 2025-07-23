import { getServerSession } from '@/lib/auth/server-session';
import { executeSQL, updateUserRole } from '@/lib/db/data-api-adapter';
import { NextResponse } from 'next/server';
import { hasRole } from '@/utils/roles';
import logger from '@/lib/logger';

export async function POST(request: Request) {
  const session = await getServerSession();
  
  if (!session) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  // Check if current user is administrator
  const isAdmin = await hasRole('administrator');
  if (!isAdmin) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  try {
    const { targetUserId, role } = await request.json();

    if (!targetUserId || !role || !['student', 'staff', 'administrator'].includes(role)) {
      return new NextResponse('Invalid request', { status: 400 });
    }

    // Update user role using RDS Data API
    await updateUserRole(targetUserId, role);
    
    // Get updated user info
    const sql = 'SELECT id, cognito_sub, email, first_name, last_name FROM users WHERE id = :userId';
    const params = [{ name: 'userId', value: { stringValue: targetUserId } }];
    const result = await executeSQL(sql, params);
    
    if (!result || result.length === 0) {
      return new NextResponse('User not found', { status: 404 });
    }
    
    return NextResponse.json(result[0]);
  } catch (error) {
    logger.error('Error updating user role:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
} 