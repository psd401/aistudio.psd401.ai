import { getServerSession } from '@/lib/auth/server-session';
import { executeSQL, updateUserRole } from '@/lib/db/data-api-adapter';
import { hasRole } from '@/utils/roles';
import { withErrorHandling, unauthorized } from '@/lib/api-utils';
import { createError } from '@/lib/error-utils';
import { getErrorMessage } from '@/types/errors';
import { ErrorLevel } from '@/types/actions-types';

export async function POST(request: Request) {
  const session = await getServerSession();
  if (!session) {
    return unauthorized('User not authenticated');
  }

  return withErrorHandling(async () => {
    // SECURITY: Only existing administrators can promote users
    const isAdmin = await hasRole('administrator');
    if (!isAdmin) {
      throw createError('Only administrators can promote users to administrator role', {
        code: 'FORBIDDEN',
        level: ErrorLevel.WARN,
        details: { cognitoSub: session.sub, action: 'promote_user' }
      });
    }

    // Get the target user ID from request body
    const body = await request.json();
    const { targetUserId } = body;

    if (!targetUserId) {
      throw createError('Target user ID is required', {
        code: 'VALIDATION',
        level: ErrorLevel.WARN,
        details: { field: 'targetUserId' }
      });
    }

    // Update target user role to administrator
    try {
      await updateUserRole(targetUserId, 'administrator');
      
      // Get updated user info
      const sql = 'SELECT id, cognito_sub, email, first_name, last_name FROM users WHERE id = :userId';
      const params = [{ name: 'userId', value: { stringValue: targetUserId } }];
      const result = await executeSQL(sql, params);
      
      if (!result || result.length === 0) {
        throw createError('User not found', {
          code: 'NOT_FOUND',
          level: ErrorLevel.WARN,
          details: { targetUserId }
        });
      }
      
      return {
        success: true,
        user: result[0]
      };
    } catch (error) {
      if (getErrorMessage(error).includes('not found')) {
        throw createError('User or role not found', {
          code: 'NOT_FOUND',
          level: ErrorLevel.WARN,
          details: { targetUserId }
        });
      }
      throw error;
    }
  });
} 