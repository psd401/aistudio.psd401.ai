import { NextRequest, NextResponse } from 'next/server';
import { getUserRoles, updateUserRoles } from '@/lib/db/user-roles';
import { requireAdmin } from '@/lib/auth/admin-check';
import { createLogger, generateRequestId, startTimer } from '@/lib/logger';
import { executeSQL } from '@/lib/db/data-api-adapter';

/**
 * Get user's roles
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ userId: string }> }
) {
  const requestId = generateRequestId();
  const timer = startTimer("api.admin.users.roles.get");
  const log = createLogger({ requestId, route: "api.admin.users.roles" });
  
  log.info("GET /api/admin/users/[userId]/roles - Getting user roles");
  
  try {
    const params = await context.params;
    const userId = parseInt(params.userId, 10);
    
    if (isNaN(userId)) {
      log.warn("Invalid user ID", { userIdString: params.userId });
      timer({ status: "error", reason: "invalid_user_id" });
      return NextResponse.json(
        { isSuccess: false, message: 'Invalid user ID' },
        { status: 400, headers: { "X-Request-Id": requestId } }
      );
    }
    
    // Check admin authorization
    const authError = await requireAdmin();
    if (authError) {
      log.warn("Unauthorized admin access attempt");
      timer({ status: "error", reason: "unauthorized" });
      return authError;
    }
    
    const roles = await getUserRoles(userId);
    
    log.info("User roles retrieved", { userId, roleCount: roles.length });
    timer({ status: "success" });
    
    return NextResponse.json({
      isSuccess: true,
      data: roles
    }, { headers: { "X-Request-Id": requestId } });
    
  } catch (error) {
    timer({ status: "error" });
    log.error('Error getting user roles', error);
    return NextResponse.json(
      { 
        isSuccess: false, 
        message: 'Failed to get user roles'
      },
      { status: 500, headers: { "X-Request-Id": requestId } }
    );
  }
}

/**
 * Update user's roles (supports multiple roles)
 */
export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ userId: string }> }
) {
  const requestId = generateRequestId();
  const timer = startTimer("api.admin.users.roles.update");
  const log = createLogger({ requestId, route: "api.admin.users.roles" });
  
  log.info("PUT /api/admin/users/[userId]/roles - Updating user roles");
  
  try {
    const params = await context.params;
    const userId = parseInt(params.userId, 10);
    
    if (isNaN(userId)) {
      log.warn("Invalid user ID", { userIdString: params.userId });
      timer({ status: "error", reason: "invalid_user_id" });
      return NextResponse.json(
        { isSuccess: false, message: 'Invalid user ID' },
        { status: 400, headers: { "X-Request-Id": requestId } }
      );
    }
    
    // Check admin authorization
    const authError = await requireAdmin();
    if (authError) {
      log.warn("Unauthorized admin access attempt");
      timer({ status: "error", reason: "unauthorized" });
      return authError;
    }
    
    // Parse request body
    const body = await request.json();
    const { roles } = body;
    
    if (!Array.isArray(roles)) {
      log.warn("Invalid roles format", { roles });
      timer({ status: "error", reason: "invalid_format" });
      return NextResponse.json(
        { isSuccess: false, message: 'Roles must be an array' },
        { status: 400, headers: { "X-Request-Id": requestId } }
      );
    }
    
    // Fetch valid roles from database
    const validRolesResult = await executeSQL('SELECT name FROM roles');
    const validRoles = validRolesResult.map(row => row.name as string);
    
    log.debug("Valid roles fetched from database", { validRoles });
    
    // Validate role names against database roles
    const invalidRoles = roles.filter(role => !validRoles.includes(role));
    
    if (invalidRoles.length > 0) {
      log.warn("Invalid role names", { invalidRoles, validRoles });
      timer({ status: "error", reason: "invalid_roles" });
      return NextResponse.json(
        { isSuccess: false, message: `Invalid roles: ${invalidRoles.join(', ')}. Valid roles are: ${validRoles.join(', ')}` },
        { status: 400, headers: { "X-Request-Id": requestId } }
      );
    }
    
    log.debug("Updating user roles", { userId, roles });
    await updateUserRoles(userId, roles);
    
    log.info("User roles updated successfully", { userId, roles });
    timer({ status: "success" });
    
    return NextResponse.json({
      isSuccess: true,
      message: 'User roles updated successfully',
      data: roles
    }, { headers: { "X-Request-Id": requestId } });
    
  } catch (error) {
    timer({ status: "error" });
    log.error('Error updating user roles', error);
    return NextResponse.json(
      { 
        isSuccess: false, 
        message: error instanceof Error ? error.message : 'Failed to update user roles'
      },
      { status: 500, headers: { "X-Request-Id": requestId } }
    );
  }
}