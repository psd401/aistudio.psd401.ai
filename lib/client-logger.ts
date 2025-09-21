"use client"

// Client-side safe logger utilities
// This provides similar functionality to the server logger but works in browsers

export interface ClientLogContext {
  requestId?: string
  component?: string
  hook?: string
  endpoint?: string
  [key: string]: unknown
}

export interface ClientLogger {
  info: (message: string, meta?: Record<string, unknown>) => void
  error: (message: string, meta?: Record<string, unknown>) => void
  warn: (message: string, meta?: Record<string, unknown>) => void
  debug: (message: string, meta?: Record<string, unknown>) => void
}

/**
 * Generate a unique request ID for client-side operations
 */
export function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}

/**
 * Sanitize data for client-side logging (remove sensitive information)
 */
export function sanitizeForLogging(data: unknown): unknown {
  if (data === null || data === undefined) {
    return data
  }

  if (typeof data === "string") {
    // Basic sanitization for client-side
    return data.substring(0, 1000)
  }

  if (typeof data === "number" || typeof data === "boolean") {
    return data
  }

  if (Array.isArray(data)) {
    return data.map(item => sanitizeForLogging(item))
  }

  if (typeof data === "object") {
    const sensitiveKeys = ['password', 'token', 'secret', 'key', 'auth', 'credential']
    const sanitized: Record<string, unknown> = {}

    for (const [key, value] of Object.entries(data)) {
      const lowerKey = key.toLowerCase()
      if (sensitiveKeys.some(sensitive => lowerKey.includes(sensitive))) {
        sanitized[key] = '[REDACTED]'
      } else if (lowerKey.includes('email') && typeof value === 'string') {
        // Mask email addresses
        sanitized[key] = value.replace(/(.{2}).*@/, '$1***@')
      } else {
        sanitized[key] = sanitizeForLogging(value)
      }
    }
    return sanitized
  }

  return String(data).slice(0, 100)
}

/**
 * Create a client-side logger with context
 */
// Global log queue and batching configuration
const logQueue: unknown[] = []
const MAX_QUEUE_SIZE = 20
const BATCH_INTERVAL = 5000 // 5 seconds
let batchTimer: NodeJS.Timeout | null = null
let isSending = false

// Function to send batched logs
const sendBatchedLogs = async () => {
  if (isSending || logQueue.length === 0) return

  isSending = true
  const logsToSend = logQueue.splice(0, logQueue.length) // Clear queue

  try {
    await fetch('/api/logs/client', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        logs: logsToSend,
        batched: true,
        timestamp: new Date().toISOString()
      }),
    })
  } catch {
    // Silent fail - don't expose errors to user
    // Note: We don't put logs back in queue to avoid infinite loops
  } finally {
    isSending = false
  }
}

// Function to queue a log for batching
const queueLog = (logData: unknown) => {
  // Add to queue
  logQueue.push(logData)

  // If queue is full, send immediately
  if (logQueue.length >= MAX_QUEUE_SIZE) {
    if (batchTimer) {
      clearTimeout(batchTimer)
      batchTimer = null
    }
    sendBatchedLogs()
    return
  }

  // Set timer if not already set
  if (!batchTimer) {
    batchTimer = setTimeout(() => {
      batchTimer = null
      sendBatchedLogs()
    }, BATCH_INTERVAL)
  }
}

// Send any remaining logs before page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    if (logQueue.length > 0) {
      // Use sendBeacon for better reliability during page unload
      if (navigator.sendBeacon) {
        navigator.sendBeacon('/api/logs/client', JSON.stringify({
          logs: logQueue,
          batched: true,
          timestamp: new Date().toISOString(),
          unload: true
        }))
      }
    }
  })
}

export function createLogger(context: ClientLogContext = {}): ClientLogger {
  const isDev = process.env.NODE_ENV === 'development'

  const log = (level: string, message: string, meta: Record<string, unknown> = {}) => {
    if (typeof window === 'undefined') return // Skip if not in browser

    const timestamp = new Date().toISOString()
    const logData = {
      timestamp,
      level,
      message,
      ...context,
      ...meta
    }

    const sanitizedData = sanitizeForLogging(logData)

    // Queue logs for batching (only errors and warnings to reduce noise)
    if (level === 'error' || level === 'warn') {
      queueLog(sanitizedData)
    }

    // Store in sessionStorage for debugging in development if needed
    if (isDev) {
      try {
        const logs = JSON.parse(sessionStorage.getItem('client-logs') || '[]')
        logs.push(sanitizedData)
        // Keep only last 100 logs
        if (logs.length > 100) {
          logs.splice(0, logs.length - 100)
        }
        sessionStorage.setItem('client-logs', JSON.stringify(logs))
      } catch {
        // Silent fail if sessionStorage is not available
      }
    }
  }

  return {
    info: (message: string, meta?: Record<string, unknown>) => log('info', message, meta),
    error: (message: string, meta?: Record<string, unknown>) => log('error', message, meta),
    warn: (message: string, meta?: Record<string, unknown>) => log('warn', message, meta),
    debug: (message: string, meta?: Record<string, unknown>) => log('debug', message, meta),
  }
}

/**
 * Create a performance timer for client-side operations
 */
export function startTimer(operation: string): (metadata?: Record<string, unknown>) => void {
  const startTime = Date.now()
  return (metadata?: Record<string, unknown>) => {
    const duration = Date.now() - startTime
    const log = createLogger({ operation: 'timer' })
    log.info('Operation completed', {
      operation,
      duration,
      ...metadata
    })
  }
}