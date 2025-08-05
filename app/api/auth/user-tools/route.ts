import { NextResponse } from "next/server"
import { getServerSession } from "@/lib/auth/server-session"
import { getUserTools } from "@/utils/roles"
import { createLogger, generateRequestId, startTimer } from '@/lib/logger';

export async function GET() {
  const requestId = generateRequestId();
  const timer = startTimer("api.auth.user-tools");
  const log = createLogger({ requestId, route: "api.auth.user-tools" });
  
  log.info("GET /api/auth/user-tools - Fetching user tools");
  
  try {
    const session = await getServerSession()
    if (!session) {
      log.warn("Unauthorized access attempt to user tools");
      timer({ status: "error", reason: "unauthorized" });
      return NextResponse.json(
        { isSuccess: false, message: "Unauthorized" },
        { status: 401, headers: { "X-Request-Id": requestId } }
      )
    }
    
    log.debug("User authenticated", { userId: session.sub });

    // Get user's tools - the getUserTools function already gets the session internally
    const tools = await getUserTools()
    
    log.info("User tools retrieved successfully", { count: tools.length });
    timer({ status: "success", count: tools.length });

    return NextResponse.json(
      {
        isSuccess: true,
        data: tools
      },
      { headers: { "X-Request-Id": requestId } }
    )
  } catch (error) {
    timer({ status: "error" });
    log.error("Error fetching user tools:", error)
    return NextResponse.json(
      { 
        isSuccess: false, 
        message: error instanceof Error ? error.message : "Failed to fetch user tools"
      },
      { status: 500, headers: { "X-Request-Id": requestId } }
    )
  }
} 