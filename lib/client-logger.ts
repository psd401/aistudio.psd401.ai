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

    // Send logs to backend endpoint for proper logging
    // This replaces console logging to comply with CLAUDE.md rules
    if (level === 'error' || level === 'warn') {
      // Only send errors and warnings to reduce noise
      sendLogToBackend(sanitizedData).catch(() => {
        // Silent fail - don't use console even for error handling
      })
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

  // Helper function to send logs to backend
  const sendLogToBackend = async (logData: unknown) => {
    try {
      await fetch('/api/logs/client', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(logData),
      })
    } catch {
      // Silent fail - don't expose errors to user
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