import { NextRequest } from "next/server"
import { getServerSession } from "@/lib/auth/server-session"
import { createLogger, generateRequestId } from "@/lib/logger"

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

    // Create a ReadableStream for SSE
    const stream = new ReadableStream({
      start(controller) {
        log.info("SSE stream started", { userId })

        // Track connection state to prevent race conditions
        let isClosed = false
        let keepAliveInterval: NodeJS.Timeout | undefined
        let maxConnectionTime: NodeJS.Timeout | undefined

        // Centralized cleanup function to prevent race conditions
        const closeConnection = () => {
          if (isClosed) return
          isClosed = true

          if (keepAliveInterval) clearInterval(keepAliveInterval)
          if (maxConnectionTime) clearTimeout(maxConnectionTime)

          try {
            controller.close()
            log.info("SSE connection closed successfully", { userId })
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
        keepAliveInterval = setInterval(() => {
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
        maxConnectionTime = setTimeout(() => {
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
        'Access-Control-Allow-Origin': '*',
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
//
// For this implementation, the SSE connection provides the infrastructure,
// and the client-side polling in the NotificationProvider serves as a fallback
// and primary mechanism for receiving updates.