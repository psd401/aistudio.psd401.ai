/**
 * Minimal logging interface for ai-streaming-core package
 * Configurable logging to avoid CLAUDE.md violations
 */

export interface LogContext {
  module?: string
  requestId?: string
  provider?: string
  modelId?: string
  [key: string]: unknown
}

/**
 * Logger interface for dependency injection
 */
export interface Logger {
  info(message: string, meta?: object): void
  error(message: string, meta?: object): void
  warn(message: string, meta?: object): void
  debug(message: string, meta?: object): void
}

/**
 * Silent logger implementation (default) - no console violations
 */
class SilentLogger implements Logger {
  info(): void {}
  error(): void {}
  warn(): void {}
  debug(): void {}
}

/**
 * Global logger instance - defaults to silent to avoid console violations
 */
let globalLogger: Logger = new SilentLogger()

/**
 * Set the global logger (for dependency injection from main app)
 */
export function setGlobalLogger(logger: Logger): void {
  globalLogger = logger
}

/**
 * Create a logger instance
 */
export function createLogger(context: LogContext = {}): Logger {
  // Return the global logger (silent by default)
  return globalLogger
}

/**
 * Generate a simple request ID
 */
export function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}