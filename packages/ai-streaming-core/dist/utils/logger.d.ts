/**
 * Minimal logging interface for ai-streaming-core package
 * Configurable logging to avoid CLAUDE.md violations
 */
export interface LogContext {
    module?: string;
    requestId?: string;
    provider?: string;
    modelId?: string;
    [key: string]: unknown;
}
/**
 * Logger interface for dependency injection
 */
export interface Logger {
    info(message: string, meta?: object): void;
    error(message: string, meta?: object): void;
    warn(message: string, meta?: object): void;
    debug(message: string, meta?: object): void;
}
/**
 * Set the global logger (for dependency injection from main app)
 */
export declare function setGlobalLogger(logger: Logger): void;
/**
 * Create a logger instance
 */
export declare function createLogger(context?: LogContext): Logger;
/**
 * Generate a simple request ID
 */
export declare function generateRequestId(): string;
