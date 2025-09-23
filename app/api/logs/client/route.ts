import { NextRequest, NextResponse } from "next/server"
import { createLogger, generateRequestId } from "@/lib/logger"
import { getServerSession } from "@/lib/auth/server-session"

// Rate limiting - in production use Redis
const requestCounts = new Map<string, { count: number; resetTime: number }>()
const RATE_LIMIT = 100 // Max 100 logs per minute per user
const RATE_WINDOW = 60 * 1000 // 1 minute

export async function POST(request: NextRequest) {
  const requestId = generateRequestId()
  const log = createLogger({ requestId, endpoint: "POST /api/logs/client" })

  try {
    // Get session for user identification (optional - logs can work without auth)
    const session = await getServerSession()
    const userId = session?.sub || 'anonymous'

    // Rate limiting
    const now = Date.now()
    const userLimit = requestCounts.get(userId)

    if (userLimit) {
      if (now < userLimit.resetTime) {
        if (userLimit.count >= RATE_LIMIT) {
          return NextResponse.json(
            { error: 'Rate limit exceeded' },
            { status: 429, headers: { 'Retry-After': '60' } }
          )
        }
        userLimit.count++
      } else {
        // Reset window
        requestCounts.set(userId, { count: 1, resetTime: now + RATE_WINDOW })
      }
    } else {
      requestCounts.set(userId, { count: 1, resetTime: now + RATE_WINDOW })
    }

    // Clean up old entries periodically (every 100 requests)
    if (Math.random() < 0.01) {
      const cutoff = now - RATE_WINDOW * 2
      for (const [key, value] of requestCounts.entries()) {
        if (value.resetTime < cutoff) {
          requestCounts.delete(key)
        }
      }
    }

    // Parse client log data
    const logData = await request.json()

    // Handle both single logs and batched logs
    const logs = logData.batched ? logData.logs : [logData]
    const isBatched = logData.batched || false
    const isUnload = logData.unload || false

    if (isBatched) {
      log.info('Processing batched client logs', {
        count: logs.length,
        userId,
        isUnload
      })
    }

    // Process each log entry
    for (const entry of logs) {
      try {
        const {
          level = 'info',
          message = 'Client log',
          component,
          hook,
          requestId: clientRequestId,
          ...meta
        } = entry

        // Log to server-side logger with client prefix
        const serverLog = createLogger({
          requestId: clientRequestId || requestId,
          source: 'client',
          component,
          hook,
          userId,
          batched: isBatched
        })

        // Route to appropriate log level
        switch (level) {
          case 'error':
            serverLog.error(`[Client] ${message}`, meta)
            break
          case 'warn':
            serverLog.warn(`[Client] ${message}`, meta)
            break
          case 'debug':
            serverLog.debug(`[Client] ${message}`, meta)
            break
          default:
            serverLog.info(`[Client] ${message}`, meta)
        }
      } catch (error) {
        log.warn('Failed to process individual log entry', {
          error: error instanceof Error ? error.message : 'Unknown error',
          entry: JSON.stringify(entry).substring(0, 200)
        })
      }
    }

    return NextResponse.json({ success: true })

  } catch (error) {
    log.error('Failed to process client log', {
      error: error instanceof Error ? error.message : 'Unknown error'
    })

    return NextResponse.json(
      { error: 'Failed to process log' },
      { status: 500 }
    )
  }
}

// OPTIONS for CORS if needed
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}