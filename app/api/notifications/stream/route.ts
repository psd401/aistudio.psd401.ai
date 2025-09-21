import { NextRequest } from "next/server"
import { getServerSession } from "@/lib/auth/server-session"
import { createLogger, generateRequestId } from "@/lib/logger"

// In-memory connection tracking (use Redis in production)
const activeConnections = new Map<string, number>()
const MAX_CONNECTIONS_PER_USER = 3

export async function GET(request: NextRequest) {
  const requestId = generateRequestId()
  const log = createLogger({ requestId, endpoint: "GET /api/notifications/stream" })

  try {
    log.info("Setting up SSE connection for notifications")

    // Auth check
    const session = await getServerSession()
    if (!session?.sub) {
      log.warn("Unauthorized SSE connection attempt")
      return new Response('Unauthorized', { status: 401 })
    }

    const userId = session.sub
    log.info("Establishing SSE connection for user", { userId })

    // Check connection limits for DoS protection
    const currentConnections = activeConnections.get(userId) || 0
    if (currentConnections >= MAX_CONNECTIONS_PER_USER) {
      log.warn("Connection limit exceeded for user", {
        userId,
        currentConnections,
        maxAllowed: MAX_CONNECTIONS_PER_USER
      })
      return new Response('Too Many Connections', {
        status: 429,
        headers: {
          'Retry-After': '60',
          'Content-Type': 'text/plain'
        }
      })
    }

    // Increment connection count
    activeConnections.set(userId, currentConnections + 1)

    // Create a ReadableStream for SSE
    const stream = new ReadableStream({
      start(controller) {
        log.info("SSE stream started", { userId })

        // Track connection state to prevent race conditions
        let isClosed = false
        const keepAliveInterval: { current?: NodeJS.Timeout } = {}
        const maxConnectionTime: { current?: NodeJS.Timeout } = {}

        // Centralized cleanup function to prevent race conditions
        const closeConnection = () => {
          if (isClosed) return
          isClosed = true

          if (keepAliveInterval.current) clearInterval(keepAliveInterval.current)
          if (maxConnectionTime.current) clearTimeout(maxConnectionTime.current)

          // Decrement connection count for DoS protection
          const currentCount = activeConnections.get(userId) || 0
          if (currentCount > 1) {
            activeConnections.set(userId, currentCount - 1)
          } else {
            activeConnections.delete(userId)
          }

          try {
            controller.close()
            log.info("SSE connection closed successfully", {
              userId,
              remainingConnections: activeConnections.get(userId) || 0
            })
          } catch (error) {
            // Controller already closed, this is expected in some scenarios
            log.debug("Controller already closed", {
              error: error instanceof Error ? error.message : 'Unknown error',
              userId
            })
          }
        }

        // Send initial connection message
        const encoder = new TextEncoder()
        const initialMessage = `data: ${JSON.stringify({
          type: 'connection_established',
          timestamp: new Date().toISOString()
        })}\n\n`

        try {
          controller.enqueue(encoder.encode(initialMessage))
        } catch (error) {
          log.error("Failed to send initial message", {
            error: error instanceof Error ? error.message : 'Unknown error',
            userId
          })
          closeConnection()
          return
        }

        // Set up keep-alive ping every 30 seconds
        keepAliveInterval.current = setInterval(() => {
          if (isClosed) return

          try {
            const pingMessage = `data: ${JSON.stringify({
              type: 'ping',
              timestamp: new Date().toISOString()
            })}\n\n`

            controller.enqueue(encoder.encode(pingMessage))
          } catch (error) {
            log.error("Error sending keep-alive ping", {
              error: error instanceof Error ? error.message : 'Unknown error',
              userId
            })
            closeConnection()
          }
        }, 30000)

        // Store connection info for potential use by notification system
        // In a production system, you might store this in Redis or similar
        // to allow other parts of the system to send real-time updates

        // Handle client disconnect
        request.signal.addEventListener('abort', () => {
          log.info("SSE connection closed by client", { userId })
          closeConnection()
        })

        // Clean up after 10 minutes to prevent resource leaks
        maxConnectionTime.current = setTimeout(() => {
          log.info("SSE connection timed out after 10 minutes", { userId })
          closeConnection()
        }, 10 * 60 * 1000)

        // Store cleanup functions for potential external triggers
        // In a real implementation, you'd want a way for the notification
        // system to send updates through this stream when new notifications arrive

        return () => {
          closeConnection()
        }
      },

      cancel() {
        log.info("SSE stream cancelled", { userId })
      }
    })

    // Return SSE response
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        // Note: Remove wildcard CORS in production and use specific allowed origins
        // 'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGINS || 'https://yourdomain.com',
        'Access-Control-Allow-Methods': 'GET',
        'Access-Control-Allow-Headers': 'Cache-Control',
      },
    })

  } catch (error) {
    log.error("Failed to establish SSE connection", {
      error: error instanceof Error ? error.message : 'Unknown error'
    })

    return new Response('Internal Server Error', { status: 500 })
  }
}

// Note: In a production system, you would typically:
// 1. Store active SSE connections in a global registry (Redis, in-memory store, etc.)
// 2. Have your notification system trigger updates to these connections
// 3. Implement proper error handling and reconnection logic
// 4. Consider using WebSockets for more complex real-time requirements
// 5. Use Redis for connection tracking across multiple server instances
// 6. Implement rate limiting middleware at the edge/proxy level
// 7. Add monitoring and alerting for connection metrics
//
// DoS Protection Notes:
// - Current implementation uses in-memory tracking (limited to single instance)
// - MAX_CONNECTIONS_PER_USER set to 3 (adjust based on requirements)
// - Returns HTTP 429 with Retry-After header when limit exceeded
// - Production should use Redis for distributed connection tracking
//
// For this implementation, the SSE connection provides the infrastructure,
// and the client-side polling in the NotificationProvider serves as a fallback
// and primary mechanism for receiving updates.