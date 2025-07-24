import { NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth/server-session';
import { hasRole } from '@/utils/roles';
import logger from '@/lib/logger';

/**
 * Middleware to check if the current user has admin privileges
 * Returns an error response if unauthorized, otherwise returns null
 */
export async function requireAdmin(): Promise<NextResponse | null> {
  try {
    // Check if user is authenticated
    const session = await getServerSession();
    
    if (!session) {
      return NextResponse.json(
        { isSuccess: false, message: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Check if user has administrator role
    const isAdmin = await hasRole('administrator');
    
    if (!isAdmin) {
      return NextResponse.json(
        { isSuccess: false, message: 'Forbidden - Admin access required' },
        { status: 403 }
      );
    }

    // User is authenticated and has admin role
    return null;
  } catch (error) {
    logger.error('Error checking admin authorization:', error);
    return NextResponse.json(
      { isSuccess: false, message: 'Authorization check failed' },
      { status: 500 }
    );
  }
}

/**
 * Higher-order function to wrap admin route handlers
 * Usage: export const GET = withAdminAuth(async (request) => { ... })
 */
export function withAdminAuth<T extends unknown[], R>(
  handler: (...args: T) => Promise<R>
): (...args: T) => Promise<R | NextResponse> {
  return async (...args: T) => {
    const authError = await requireAdmin();
    if (authError) return authError;
    
    return handler(...args);
  };
}