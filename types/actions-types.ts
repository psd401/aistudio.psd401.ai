/**
 * Standard response type for all server actions and API endpoints
 * Provides a consistent interface for handling success and error states
 */
export type ActionState<T = unknown> = 
  | { isSuccess: true; message: string; data: T }
  | { isSuccess: false; message: string; error?: Error | unknown; data?: never }

/**
 * Error levels for logging
 */
export enum ErrorLevel {
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
  FATAL = 'fatal'
}

/**
 * Structured error object for consistent error handling
 */
export interface AppError extends Error {
  code?: string;
  level: ErrorLevel;
  details?: Record<string, unknown>;
}