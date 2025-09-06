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
 * Global logger instance - defaults to silent to avoid console violations
 */
let globalLogger = new SilentLogger();
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
    // Return the global logger (silent by default)
    return globalLogger;
}
/**
 * Generate a simple request ID
 */
function generateRequestId() {
    return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}
//# sourceMappingURL=logger.js.map