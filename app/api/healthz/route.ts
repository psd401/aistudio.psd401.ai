import { NextResponse } from "next/server"
import { createLogger, generateRequestId } from "@/lib/logger"

/**
 * Lightweight Health Check Endpoint for ECS/Container Health Checks
 *
 * This endpoint provides a fast, minimal health check suitable for:
 * - ECS task health checks
 * - Docker HEALTHCHECK commands
 * - Load balancer health probes
 *
 * Returns 200 OK if the Next.js server is running and responsive.
 * For detailed health checks including database connectivity, use /api/health instead.
 */
export async function GET() {
  const requestId = generateRequestId()
  const log = createLogger({ requestId, context: "healthz" })

  try {
    return NextResponse.json(
      {
        status: "ok",
        timestamp: new Date().toISOString()
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
          "Content-Type": "application/json"
        }
      }
    )
  } catch (error) {
    log.error("Health check failed", { error })
    return NextResponse.json(
      {
        status: "error",
        timestamp: new Date().toISOString()
      },
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
          "Content-Type": "application/json"
        }
      }
    )
  }
}
