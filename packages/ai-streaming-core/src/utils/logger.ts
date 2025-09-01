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
 * Console logger implementation for Lambda environment
 */
class ConsoleLogger implements Logger {
  info(message: string, meta?: object): void {
    // eslint-disable-next-line no-console
    console.log(`[INFO] ${message}`, meta ? JSON.stringify(meta) : '');
  }
  error(message: string, meta?: object): void {
    // eslint-disable-next-line no-console
    console.error(`[ERROR] ${message}`, meta ? JSON.stringify(meta) : '');
  }
  warn(message: string, meta?: object): void {
    // eslint-disable-next-line no-console
    console.warn(`[WARN] ${message}`, meta ? JSON.stringify(meta) : '');
  }
  debug(message: string, meta?: object): void {
    // eslint-disable-next-line no-console
    console.log(`[DEBUG] ${message}`, meta ? JSON.stringify(meta) : '');
  }
}

/**
 * Global logger instance - uses console in Lambda, silent otherwise
 */
let globalLogger: Logger = process.env.AWS_LAMBDA_FUNCTION_NAME 
  ? new ConsoleLogger() 
  : new SilentLogger()

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
  // Create a contextualized logger that merges context into all log calls
  return {
    info(message: string, meta?: object): void {
      globalLogger.info(message, { ...context, ...meta });
    },
    error(message: string, meta?: object): void {
      globalLogger.error(message, { ...context, ...meta });
    },
    warn(message: string, meta?: object): void {
      globalLogger.warn(message, { ...context, ...meta });
    },
    debug(message: string, meta?: object): void {
      globalLogger.debug(message, { ...context, ...meta });
    }
  };
}

/**
 * Generate a simple request ID
 */
export function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}