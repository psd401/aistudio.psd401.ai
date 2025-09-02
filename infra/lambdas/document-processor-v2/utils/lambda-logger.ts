/**
 * Lambda-compatible structured logger
 * Provides structured logging for AWS Lambda functions with CloudWatch integration
 */

export interface LogContext {
  requestId?: string;
  jobId?: string;
  service?: string;
  operation?: string;
  processorType?: string;
  [key: string]: any;
}

export interface LogMetrics {
  processingTime?: number;
  fileSize?: number;
  status?: string;
  [key: string]: any;
}

export class LambdaLogger {
  private context: LogContext;

  constructor(context: LogContext = {}) {
    this.context = {
      service: 'document-processor-v2',
      timestamp: new Date().toISOString(),
      ...context
    };
  }

  private formatMessage(level: string, message: string, data?: any): string {
    const logEntry = {
      level: level.toUpperCase(),
      message,
      ...this.context,
      ...(data && { data: this.sanitizeData(data) }),
      timestamp: new Date().toISOString()
    };

    return JSON.stringify(logEntry);
  }

  private sanitizeData(data: any): any {
    if (data === null || data === undefined) {
      return data;
    }

    if (typeof data === 'string') {
      // Remove potentially sensitive information
      return data.replace(/password|secret|key|token|auth/gi, '[REDACTED]');
    }

    if (Array.isArray(data)) {
      return data.map(item => this.sanitizeData(item));
    }

    if (typeof data === 'object') {
      const sanitized: any = {};
      for (const [key, value] of Object.entries(data)) {
        if (key.toLowerCase().includes('password') || 
            key.toLowerCase().includes('secret') || 
            key.toLowerCase().includes('key') ||
            key.toLowerCase().includes('token')) {
          sanitized[key] = '[REDACTED]';
        } else {
          sanitized[key] = this.sanitizeData(value);
        }
      }
      return sanitized;
    }

    return data;
  }

  info(message: string, data?: any): void {
    // In Lambda, console.log goes to CloudWatch automatically
    // eslint-disable-next-line no-console
    console.log(this.formatMessage('info', message, data));
  }

  error(message: string, error?: Error | any, data?: any): void {
    const errorData = error instanceof Error ? {
      errorName: error.name,
      errorMessage: error.message,
      errorStack: error.stack,
      ...data
    } : { error, ...data };

    // eslint-disable-next-line no-console
    console.error(this.formatMessage('error', message, errorData));
  }

  warn(message: string, data?: any): void {
    // eslint-disable-next-line no-console
    console.warn(this.formatMessage('warn', message, data));
  }

  debug(message: string, data?: any): void {
    // Only log debug messages if DEBUG environment variable is set
    if (process.env.DEBUG) {
      // eslint-disable-next-line no-console
      console.debug(this.formatMessage('debug', message, data));
    }
  }

  withContext(additionalContext: LogContext): LambdaLogger {
    return new LambdaLogger({
      ...this.context,
      ...additionalContext
    });
  }

  startTimer(operation: string): () => void {
    const startTime = Date.now();
    return () => {
      const duration = Date.now() - startTime;
      this.info(`Operation completed: ${operation}`, {
        operation,
        duration,
        metrics: { processingTime: duration }
      });
    };
  }

  logMetrics(operation: string, metrics: LogMetrics): void {
    this.info(`Metrics: ${operation}`, {
      operation,
      metrics
    });
  }
}

/**
 * Create a logger instance with optional context
 */
export function createLambdaLogger(context?: LogContext): LambdaLogger {
  return new LambdaLogger(context);
}

/**
 * Default logger instance for simple use cases
 */
export const defaultLogger = new LambdaLogger();