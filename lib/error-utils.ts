import { AppError, ErrorLevel, ActionState } from "@/types/actions-types";
import logger from "@/lib/logger"

/**
 * Creates a structured AppError with standardized properties
 */
export function createError(
  message: string,
  options: {
    code?: string;
    level?: ErrorLevel;
    details?: Record<string, unknown>;
    cause?: Error;
  } = {}
): AppError {
  const { code, level = ErrorLevel.ERROR, details, cause } = options;
  
  const error = new Error(message, { cause }) as AppError;
  error.code = code;
  error.level = level;
  error.details = details;
  
  return error;
}

/**
 * Handles errors and returns a standardized ActionState
 * Also performs logging based on error level
 */
export function handleError(
  error: unknown, 
  userMessage = "An unexpected error occurred",
  logOptions: {
    context?: string;
    includeErrorInResponse?: boolean;
  } = {}
): ActionState<never> {
  const { context = '', includeErrorInResponse = false } = logOptions;
  
  // Format the log prefix for context
  const logPrefix = context ? `[${context}] ` : '';
  
  // Handle AppError type
  if (error instanceof Error && 'level' in error && (error as AppError).level) {
    const appError = error as AppError;
    
    // Log based on error level
    switch (appError.level) {
      case ErrorLevel.INFO:
        logger.info(appError.message, { context: logPrefix, details: appError.details || undefined })
        break;
      case ErrorLevel.WARN:
        logger.warn(appError.message, { context: logPrefix, details: appError.details || undefined })
        break;
      case ErrorLevel.ERROR:
        logger.error(appError.message, { context: logPrefix, details: appError.details || undefined })
        break;
      case ErrorLevel.FATAL:
        logger.error(`FATAL: ${appError.message}`, { context: logPrefix, details: appError.details || undefined })
        break;
    }
    
    // Return standardized response
    return {
      isSuccess: false,
      message: userMessage,
      ...(includeErrorInResponse && { error: appError })
    };
  }
  
  // Handle standard Error objects
  if (error instanceof Error) {
    logger.error(error.message, { context: logPrefix, error })
    return {
      isSuccess: false,
      message: userMessage,
      ...(includeErrorInResponse && { error })
    };
  }
  
  // Handle unknown error types
  logger.error(`Unknown error`, { context: logPrefix, error })
  return {
    isSuccess: false,
    message: userMessage,
    ...(includeErrorInResponse && { error })
  };
}

/**
 * Creates a success ActionState
 */
export function createSuccess<T>(data: T, message = "Operation successful"): ActionState<T> {
  return {
    isSuccess: true,
    message,
    data
  };
}