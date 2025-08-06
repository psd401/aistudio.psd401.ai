import { NextResponse } from "next/server"
import { getServerSession } from "@/lib/auth/server-session"
import { createLogger, generateRequestId, startTimer } from "@/lib/logger"

export async function GET() {
  const requestId = generateRequestId();
  const timer = startTimer("api.auth.me");
  const log = createLogger({ requestId, route: "api.auth.me" });
  
  log.info("GET /api/auth/me - Getting current user");
  
  try {
    const session = await getServerSession()
    
    if (!session) {
      log.warn("Unauthorized access attempt to /api/auth/me");
      timer({ status: "error", reason: "unauthorized" });
      return NextResponse.json(
        { error: "Unauthorized" }, 
        { status: 401, headers: { "X-Request-Id": requestId } }
      )
    }
    
    log.debug("User authenticated", { userId: session.sub, email: session.email });
    timer({ status: "success" });
    
    return NextResponse.json(
      { 
        userId: session.sub,
        email: session.email 
      },
      { headers: { "X-Request-Id": requestId } }
    )
  } catch (error) {
    timer({ status: "error" });
    log.error("Error in auth/me endpoint:", error)
    return NextResponse.json(
      { error: "Authentication error" },
      { status: 500, headers: { "X-Request-Id": requestId } }
    )
  }
} 