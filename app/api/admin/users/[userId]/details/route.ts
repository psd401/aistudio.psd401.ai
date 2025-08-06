import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/admin-check';
import { executeSQL } from '@/lib/db/data-api-adapter';
import { createLogger, generateRequestId, startTimer } from '@/lib/logger';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ userId: string }> }
) {
  const requestId = generateRequestId();
  const timer = startTimer("api.admin.users.details");
  const log = createLogger({ requestId, route: "api.admin.users.details" });
  
  log.info("GET /api/admin/users/[userId]/details - Fetching user details");
  
  const params = await context.params;
  // Check admin authorization
  const authError = await requireAdmin();
  if (authError) {
    log.warn("Unauthorized admin access attempt");
    timer({ status: "error", reason: "unauthorized" });
    return authError;
  }

  try {
    log.debug("Fetching user details", { userId: params.userId });
    
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
      log.warn("User not found", { userId: params.userId });
      timer({ status: "error", reason: "user_not_found" });
      return new NextResponse('User not found', { status: 404, headers: { "X-Request-Id": requestId } });
    }
    
    const user = result[0];
    
    log.info("User details fetched successfully", { userId: params.userId });
    timer({ status: "success" });
    
    return NextResponse.json({
      firstName: user.first_name,
      lastName: user.last_name,
      emailAddresses: [{ emailAddress: user.email }]
    }, { headers: { "X-Request-Id": requestId } });
  } catch (error) {
    timer({ status: "error" });
    log.error('Error fetching user details', error);
    return new NextResponse('Internal Server Error', { status: 500, headers: { "X-Request-Id": requestId } });
  }
} 