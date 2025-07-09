import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/admin-check';
import { executeSQL } from '@/lib/db/data-api-adapter';
import logger from '@/lib/logger';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ userId: string }> }
) {
  const params = await context.params;
  // Check admin authorization
  const authError = await requireAdmin();
  if (authError) return authError;

  try {
    // Get user details from database
    const query = `
      SELECT id, cognito_sub, email, first_name, last_name
      FROM users
      WHERE id = :userId
    `;
    const parameters = [
      { name: 'userId', value: { stringValue: params.userId } }
    ];
    
    const result = await executeSQL(query, parameters);
    
    if (!result || result.length === 0) {
      return new NextResponse('User not found', { status: 404 });
    }
    
    const user = result[0];
    
    return NextResponse.json({
      firstName: user.first_name,
      lastName: user.last_name,
      emailAddresses: [{ emailAddress: user.email }]
    });
  } catch (error) {
    logger.error('Error fetching user details:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
} 