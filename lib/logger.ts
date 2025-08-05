// Winston logger utility for structured, environment-aware logging with enhanced capabilities
// - Development: pretty, colorized logs to console with context
// - Production: Structured JSON logs for CloudWatch with full metadata
// - Features: Request ID tracking, user context, performance metrics, sensitive data filtering
// Usage: import logger, { createLogger, generateRequestId } from "@/lib/logger"

import winston, { Logger } from "winston"
import { nanoid } from "nanoid"
import { AsyncLocalStorage } from "async_hooks"

const isProd = process.env.NODE_ENV === "production"
const isTest = process.env.NODE_ENV === "test"

// AsyncLocalStorage for request context propagation
const asyncLocalStorage = new AsyncLocalStorage<LogContext>()

// Log context interface for structured metadata
export interface LogContext {
  requestId?: string
  userId?: string
  userEmail?: string
  action?: string
  route?: string
  method?: string
  duration?: number
  sessionId?: string
  environment?: string
  version?: string
  region?: string
  [key: string]: unknown
}

// Sensitive data patterns to filter from logs
const SENSITIVE_PATTERNS = [
  /password["\s]*[:=]\s*["']?[^"'\s,}]+/gi,
  /token["\s]*[:=]\s*["']?[^"'\s,}]+/gi,
  /api[_-]?key["\s]*[:=]\s*["']?[^"'\s,}]+/gi,
  /secret["\s]*[:=]\s*["']?[^"'\s,}]+/gi,
  /authorization["\s]*[:=]\s*["']?bearer\s+[^"'\s,}]+/gi,
  /cognito[_-]?sub["\s]*[:=]\s*["']?[^"'\s,}]+/gi,
]

// Email masking pattern (show domain only)
const EMAIL_PATTERN = /([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g

/**
 * Filters sensitive data from log messages and metadata
 */
function filterSensitiveData(data: unknown): unknown {
  if (typeof data === "string") {
    let filtered = data
    // Filter out sensitive patterns
    SENSITIVE_PATTERNS.forEach(pattern => {
      filtered = filtered.replace(pattern, "[REDACTED]")
    })
    // Mask email addresses (keep domain for debugging)
    filtered = filtered.replace(EMAIL_PATTERN, "***@$2")
    return filtered
  }
  
  if (Array.isArray(data)) {
    return data.map(filterSensitiveData)
  }
  
  if (data && typeof data === "object") {
    const filtered: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(data)) {
      // Check if key contains sensitive field names
      const lowerKey = key.toLowerCase()
      if (lowerKey.includes("password") || 
          lowerKey.includes("token") || 
          lowerKey.includes("secret") ||
          lowerKey.includes("apikey") ||
          lowerKey.includes("api_key")) {
        filtered[key] = "[REDACTED]"
      } else if (lowerKey.includes("email")) {
        filtered[key] = typeof value === "string" 
          ? value.replace(EMAIL_PATTERN, "***@$2")
          : value
      } else {
        filtered[key] = filterSensitiveData(value)
      }
    }
    return filtered
  }
  
  return data
}

/**
 * Custom format for development environment
 */
const devFormat = winston.format.printf(({ timestamp, level, message, ...meta }) => {
  const context = getLogContext()
  const allMeta = { ...context, ...meta }
  
  // Filter sensitive data in dev
  const filteredMeta = filterSensitiveData(allMeta)
  const metaString = Object.keys(filteredMeta as object).length 
    ? `\n${JSON.stringify(filteredMeta, null, 2)}` 
    : ""
  
  const requestId = context?.requestId ? `[${context.requestId}] ` : ""
  return `${timestamp} ${requestId}${level}: ${message}${metaString}`
})

/**
 * Custom format for production - structured JSON with metadata
 */
// Type for log entry with optional stack trace
interface LogEntryWithStack extends Record<string, unknown> {
  timestamp: string
  level: string
  message: string
  environment: string
  version: string
  region: string
  stack?: string
}

const prodFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.printf((info) => {
    const context = getLogContext()
    const { timestamp, level, message, stack, ...meta } = info
    
    const logEntry: LogEntryWithStack = {
      timestamp: timestamp as string,
      level: level as string,
      message: message as string,
      ...context,
      ...meta,
      environment: process.env.NODE_ENV || "development",
      version: process.env.APP_VERSION || "unknown",
      region: process.env.AWS_REGION || "unknown",
    }
    
    if (stack) {
      logEntry.stack = stack as string
    }
    
    // Filter sensitive data in production
    return JSON.stringify(filterSensitiveData(logEntry))
  })
)

// Main logger instance
const logger: Logger = winston.createLogger({
  level: isTest ? "error" : (isProd ? "info" : "debug"),
  format: isProd ? prodFormat : winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp(),
    devFormat
  ),
  transports: [new winston.transports.Console()],
  // Prevent unhandled promise rejections from crashing in production
  exitOnError: !isProd,
})

/**
 * Generate a unique request ID using nanoid
 */
export function generateRequestId(): string {
  return nanoid(10)
}

/**
 * Get the current log context from AsyncLocalStorage
 */
export function getLogContext(): LogContext {
  return asyncLocalStorage.getStore() || {}
}

/**
 * Set or update the log context
 */
export function setLogContext(context: LogContext): void {
  const currentContext = getLogContext()
  asyncLocalStorage.enterWith({ ...currentContext, ...context })
}

/**
 * Run a function with a specific log context
 */
export async function withLogContext<T>(
  context: LogContext,
  fn: () => T | Promise<T>
): Promise<T> {
  return asyncLocalStorage.run(context, fn)
}

/**
 * Create a child logger with additional context
 * This maintains all parent context and adds new fields
 */
export function createLogger(context: LogContext): Logger {
  return {
    ...logger,
    info: (message: string, meta?: object) => {
      const fullContext = { ...getLogContext(), ...context }
      logger.info(message, { ...fullContext, ...meta })
    },
    warn: (message: string, meta?: object) => {
      const fullContext = { ...getLogContext(), ...context }
      logger.warn(message, { ...fullContext, ...meta })
    },
    error: (message: string, meta?: object) => {
      const fullContext = { ...getLogContext(), ...context }
      logger.error(message, { ...fullContext, ...meta })
    },
    debug: (message: string, meta?: object) => {
      const fullContext = { ...getLogContext(), ...context }
      logger.debug(message, { ...fullContext, ...meta })
    },
  } as Logger
}

/**
 * Helper to create a child logger with request ID (backward compatible)
 * @deprecated Use createLogger({ requestId }) instead
 */
export function withRequestId(requestId: string): Logger {
  return createLogger({ requestId })
}

/**
 * Sanitize data for logging (removes sensitive fields)
 */
export function sanitizeForLogging(data: unknown): unknown {
  return filterSensitiveData(data)
}

/**
 * Log performance metrics for an operation
 */
export function logPerformance(
  operation: string,
  startTime: number,
  metadata?: object
): void {
  const duration = Date.now() - startTime
  const context = getLogContext()
  
  logger.info(`Performance: ${operation}`, {
    ...context,
    operation,
    duration,
    ...metadata,
  })
}

/**
 * Create a performance timer for measuring operation duration
 */
export function startTimer(operation: string): (metadata?: object) => void {
  const startTime = Date.now()
  return (metadata?: object) => {
    logPerformance(operation, startTime, metadata)
  }
}

export default logger 