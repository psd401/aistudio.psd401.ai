/* eslint-disable logging/require-request-id */
import { NextResponse } from "next/server"

/**
 * Ultra-Lightweight Health Check Endpoint for ECS/ALB
 *
 * Optimized for sub-millisecond response times with zero dependencies.
 *
 * Design decisions:
 * - NO logger imports (winston + AsyncLocalStorage adds 10-50ms overhead)
 * - NO database checks (use /api/health for comprehensive checks)
 * - Dynamic route to ensure server.js serves it correctly in standalone mode
 * - Minimal JSON payload
 * - Logging disabled: This endpoint is called every 30s and must be ultra-fast
 *
 * This endpoint is called every 30 seconds by:
 * - ECS task health checks
 * - ALB target health checks
 *
 * For detailed health checks including database connectivity, use /api/health instead.
 */
export async function GET() {
  return NextResponse.json(
    {
      status: "ok",
      timestamp: Date.now()
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "Content-Type": "application/json"
      }
    }
  )
}

// Force dynamic rendering to ensure route is always served by server.js
// This is critical for container health checks to work reliably in standalone mode
export const dynamic = 'force-dynamic'
export const revalidate = 0
