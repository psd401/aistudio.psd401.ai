"use strict";
/**
 * Lambda-compatible structured logger
 * Provides structured logging for AWS Lambda functions with CloudWatch integration
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultLogger = exports.LambdaLogger = void 0;
exports.createLambdaLogger = createLambdaLogger;
class LambdaLogger {
    constructor(context = {}) {
        this.context = {
            service: 'document-processor-v2',
            timestamp: new Date().toISOString(),
            ...context
        };
    }
    formatMessage(level, message, data) {
        const logEntry = {
            level: level.toUpperCase(),
            message,
            ...this.context,
            ...(data && { data: this.sanitizeData(data) }),
            timestamp: new Date().toISOString()
        };
        return JSON.stringify(logEntry);
    }
    sanitizeData(data) {
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
            const sanitized = {};
            for (const [key, value] of Object.entries(data)) {
                if (key.toLowerCase().includes('password') ||
                    key.toLowerCase().includes('secret') ||
                    key.toLowerCase().includes('key') ||
                    key.toLowerCase().includes('token')) {
                    sanitized[key] = '[REDACTED]';
                }
                else {
                    sanitized[key] = this.sanitizeData(value);
                }
            }
            return sanitized;
        }
        return data;
    }
    info(message, data) {
        // In Lambda, console.log goes to CloudWatch automatically
        // eslint-disable-next-line no-console
        console.log(this.formatMessage('info', message, data));
    }
    error(message, error, data) {
        const errorData = error instanceof Error ? {
            errorName: error.name,
            errorMessage: error.message,
            errorStack: error.stack,
            ...data
        } : { error, ...data };
        // eslint-disable-next-line no-console
        console.error(this.formatMessage('error', message, errorData));
    }
    warn(message, data) {
        // eslint-disable-next-line no-console
        console.warn(this.formatMessage('warn', message, data));
    }
    debug(message, data) {
        // Only log debug messages if DEBUG environment variable is set
        if (process.env.DEBUG) {
            // eslint-disable-next-line no-console
            console.debug(this.formatMessage('debug', message, data));
        }
    }
    withContext(additionalContext) {
        return new LambdaLogger({
            ...this.context,
            ...additionalContext
        });
    }
    startTimer(operation) {
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
    logMetrics(operation, metrics) {
        this.info(`Metrics: ${operation}`, {
            operation,
            metrics
        });
    }
}
exports.LambdaLogger = LambdaLogger;
/**
 * Create a logger instance with optional context
 */
function createLambdaLogger(context) {
    return new LambdaLogger(context);
}
/**
 * Default logger instance for simple use cases
 */
exports.defaultLogger = new LambdaLogger();
