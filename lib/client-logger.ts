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

    if (isDev) {
      // Pretty logging in development
      const contextStr = context.requestId ? `[${context.requestId}] ` : ''
      const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(sanitizedData)}` : ''

      if (level === 'error') {
        // eslint-disable-next-line no-console
        console.error(`${timestamp} ${contextStr}${level.toUpperCase()}: ${message}${metaStr}`)
      } else if (level === 'warn') {
        // eslint-disable-next-line no-console
        console.warn(`${timestamp} ${contextStr}${level.toUpperCase()}: ${message}${metaStr}`)
      } else {
        // eslint-disable-next-line no-console
        console.log(`${timestamp} ${contextStr}${level.toUpperCase()}: ${message}${metaStr}`)
      }
    } else {
      // Structured logging in production
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(sanitizedData))
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