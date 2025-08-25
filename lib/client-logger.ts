/* eslint-disable no-console */
// Client-safe logger that works in both browser and Node.js environments
// - Client: Uses console methods with structured formatting
// - Server: Falls back to full Winston logger
// - Provides same interface as server logger for consistency

export interface ClientLogContext {
  requestId?: string
  userId?: string
  userEmail?: string
  action?: string
  route?: string
  method?: string
  duration?: number
  sessionId?: string
  moduleName?: string
  [key: string]: unknown
}

export interface ClientLogger {
  info: (message: string, meta?: object) => void
  warn: (message: string, meta?: object) => void
  error: (message: string, meta?: object) => void
  debug: (message: string, meta?: object) => void
}

function formatClientLog(level: string, message: string, context: ClientLogContext, meta?: object): string {
  const timestamp = new Date().toISOString()
  const requestId = context.requestId ? `[${context.requestId}] ` : ""
  const moduleName = context.moduleName ? `[${context.moduleName}] ` : ""
  const metaStr = meta && Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : ""
  return `${timestamp} ${requestId}${moduleName}${level.toUpperCase()}: ${message}${metaStr}`
}

function sanitizeMetaForProduction(meta?: object): object | undefined {
  if (!meta || process.env.NODE_ENV !== 'production') {
    return meta
  }
  
  // In production, remove potentially sensitive fields
  const sanitized = { ...meta } as Record<string, unknown>
  const sensitiveFields = ['password', 'apiKey', 'token', 'secret', 'key', 'auth', 'credentials']
  
  for (const field of sensitiveFields) {
    if (field in sanitized) {
      delete sanitized[field]
    }
  }
  
  return sanitized
}

function createClientLogger(context: ClientLogContext): ClientLogger {
  const isClient = typeof window !== 'undefined'
  const isProd = process.env.NODE_ENV === 'production'
  
  if (isClient && isProd) {
    // Production client-side: minimal logging to prevent information exposure
    return {
      info: () => {}, // No-op in production client-side
      warn: () => {}, // No-op in production client-side  
      error: (message: string) => {
        // Only log critical errors in production, sanitized
        console.error(`ERROR: ${message}`)
      },
      debug: () => {} // No-op in production
    }
  }
  
  if (isClient) {
    // Development client-side logging using console methods
    return {
      info: (message: string, meta?: object) => {
        console.log(formatClientLog('info', message, context, sanitizeMetaForProduction(meta)))
      },
      warn: (message: string, meta?: object) => {
        console.warn(formatClientLog('warn', message, context, sanitizeMetaForProduction(meta)))
      },
      error: (message: string, meta?: object) => {
        console.error(formatClientLog('error', message, context, sanitizeMetaForProduction(meta)))
      },
      debug: (message: string, meta?: object) => {
        console.debug(formatClientLog('debug', message, context, sanitizeMetaForProduction(meta)))
      },
    }
  } else {
    // Server-side: fallback to console with formatted output
    // Winston will be used by server-side code that imports from @/lib/logger directly
    return {
      info: (message: string, meta?: object) => {
        console.log(formatClientLog('info', message, context, meta))
      },
      warn: (message: string, meta?: object) => {
        console.warn(formatClientLog('warn', message, context, meta))
      },
      error: (message: string, meta?: object) => {
        console.error(formatClientLog('error', message, context, meta))
      },
      debug: (message: string, meta?: object) => {
        if (process.env.NODE_ENV === 'development') {
          console.debug(formatClientLog('debug', message, context, meta))
        }
      },
    }
  }
}

export { createClientLogger as createLogger }