/**
 * Edge Runtime compatible logger for authentication modules
 *
 * This logger is designed to work in Edge Runtime environments where Node.js APIs
 * are not available. It provides structured logging that can be captured by
 * monitoring systems without violating Edge Runtime constraints.
 *
 * Security Note: In production, token metadata logging is sanitized to prevent
 * potential information disclosure through logs.
 */

interface EdgeLogger {
  info: (message: string, meta?: Record<string, unknown>) => void
  warn: (message: string, meta?: Record<string, unknown>) => void
  error: (message: string, meta?: Record<string, unknown>) => void
  debug: (message: string, meta?: Record<string, unknown>) => void
}

interface LogContext {
  context: string
  tokenSub?: string
  [key: string]: unknown
}

interface LogEntry {
  level: string
  message: string
  timestamp: string
  context: string
  meta?: Record<string, unknown>
}

// Global log store for Edge Runtime (per request isolation)
let globalLogStore: LogEntry[] = []

/**
 * Creates an Edge Runtime compatible logger instance
 *
 * @param context - Logging context including module name and optional token identifier
 * @returns EdgeLogger instance with info, warn, error, and debug methods
 */
export function createEdgeLogger(context: LogContext): EdgeLogger {
  // Sanitize token sub in production to prevent information disclosure
  const sanitizedTokenSub = process.env.NODE_ENV === 'production' && context.tokenSub
    ? context.tokenSub.substring(0, 8) + '***'
    : context.tokenSub || 'unknown'

  /**
   * Sanitizes metadata to prevent sensitive information leakage in logs
   * Removes or truncates potentially sensitive fields
   */
  const sanitizeMetadata = (meta?: Record<string, unknown>): Record<string, unknown> | undefined => {
    if (!meta) return undefined

    const sanitized: Record<string, unknown> = {}

    for (const [key, value] of Object.entries(meta)) {
      // Don't log actual token values or sensitive data
      if (key.toLowerCase().includes('token') && typeof value === 'string' && value.length > 20) {
        sanitized[key] = '[REDACTED_TOKEN]'
      } else if (key === 'tokenSub' && typeof value === 'string' && process.env.NODE_ENV === 'production') {
        sanitized[key] = value.substring(0, 8) + '***'
      } else if (key === 'error' && typeof value === 'string') {
        // Sanitize error messages that might contain tokens
        sanitized[key] = value.replace(/[a-zA-Z0-9+/=]{20,}/g, '[REDACTED_TOKEN]')
      } else {
        sanitized[key] = value
      }
    }

    return sanitized
  }

  const createLogEntry = (level: string, message: string, meta?: Record<string, unknown>): LogEntry => {
    return {
      level,
      message,
      timestamp: new Date().toISOString(),
      context: `${context.context}[${sanitizedTokenSub}]`,
      meta: sanitizeMetadata(meta)
    }
  }

  const logMessage = (level: string, message: string, meta?: Record<string, unknown>) => {
    const entry = createLogEntry(level, message, meta)

    // Store in global log store for potential retrieval
    globalLogStore.push(entry)

    // Keep only last 100 entries to prevent memory leaks
    if (globalLogStore.length > 100) {
      globalLogStore.shift()
    }

    // In development, attempt to output to available logging mechanism
    if (process.env.NODE_ENV === 'development') {
      try {
        const formattedMessage = `[${entry.timestamp}] ${entry.context} ${level}: ${message}`
        const metaString = entry.meta ? ` ${JSON.stringify(entry.meta)}` : ''

        // Try to use fetch to send to a logging endpoint if available
        // This is Edge Runtime compatible
        if (process.env.DEBUG_LOG_ENDPOINT) {
          fetch(process.env.DEBUG_LOG_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(entry)
          }).catch(() => {
            // Silently fail if logging endpoint unavailable
          })
        }

        // For development debugging - this will work in Node.js runtime
        // but fail silently in Edge Runtime
        if (typeof process !== 'undefined' && process.stderr && process.stdout) {
          if (level === 'ERROR') {
            process.stderr.write(`${formattedMessage}${metaString}\n`)
          } else {
            process.stdout.write(`${formattedMessage}${metaString}\n`)
          }
        }
      } catch {
        // Silently fail if any logging mechanism fails
        // This ensures the logger never breaks the application
      }
    }
  }

  return {
    info: (message: string, meta?: Record<string, unknown>) => {
      logMessage('INFO', message, meta)
    },

    warn: (message: string, meta?: Record<string, unknown>) => {
      logMessage('WARN', message, meta)
    },

    error: (message: string, meta?: Record<string, unknown>) => {
      logMessage('ERROR', message, meta)
    },

    debug: (message: string, meta?: Record<string, unknown>) => {
      // Only log debug messages in development to reduce production overhead
      if (process.env.NODE_ENV === 'development') {
        logMessage('DEBUG', message, meta)
      }
    }
  }
}

/**
 * Retrieves all log entries from the global store
 * Useful for debugging or sending logs to monitoring systems
 */
export function getLogEntries(): LogEntry[] {
  return [...globalLogStore]
}

/**
 * Clears the global log store
 * Useful for preventing memory leaks in long-running processes
 */
export function clearLogEntries(): void {
  globalLogStore = []
}

/**
 * Alias for createEdgeLogger to maintain compatibility with existing createLogger calls
 * This allows existing code to use the same function name while getting Edge Runtime compatibility
 */
export const createLogger = createEdgeLogger