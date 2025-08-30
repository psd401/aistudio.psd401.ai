"use strict";
/**
 * Minimal logging interface for ai-streaming-core package
 * Configurable logging to avoid CLAUDE.md violations
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.setGlobalLogger = setGlobalLogger;
exports.createLogger = createLogger;
exports.generateRequestId = generateRequestId;
/**
 * Silent logger implementation (default) - no console violations
 */
class SilentLogger {
    info() { }
    error() { }
    warn() { }
    debug() { }
}
/**
 * Console logger implementation for Lambda environment
 */
class ConsoleLogger {
    info(message, meta) {
        // eslint-disable-next-line no-console
        console.log(`[INFO] ${message}`, meta ? JSON.stringify(meta) : '');
    }
    error(message, meta) {
        // eslint-disable-next-line no-console
        console.error(`[ERROR] ${message}`, meta ? JSON.stringify(meta) : '');
    }
    warn(message, meta) {
        // eslint-disable-next-line no-console
        console.warn(`[WARN] ${message}`, meta ? JSON.stringify(meta) : '');
    }
    debug(message, meta) {
        // eslint-disable-next-line no-console
        console.log(`[DEBUG] ${message}`, meta ? JSON.stringify(meta) : '');
    }
}
/**
 * Global logger instance - uses console in Lambda, silent otherwise
 */
let globalLogger = process.env.AWS_LAMBDA_FUNCTION_NAME
    ? new ConsoleLogger()
    : new SilentLogger();
/**
 * Set the global logger (for dependency injection from main app)
 */
function setGlobalLogger(logger) {
    globalLogger = logger;
}
/**
 * Create a logger instance
 */
function createLogger(context = {}) {
    // Create a contextualized logger that merges context into all log calls
    return {
        info(message, meta) {
            globalLogger.info(message, { ...context, ...meta });
        },
        error(message, meta) {
            globalLogger.error(message, { ...context, ...meta });
        },
        warn(message, meta) {
            globalLogger.warn(message, { ...context, ...meta });
        },
        debug(message, meta) {
            globalLogger.debug(message, { ...context, ...meta });
        }
    };
}
/**
 * Generate a simple request ID
 */
function generateRequestId() {
    return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}
//# sourceMappingURL=logger.js.map