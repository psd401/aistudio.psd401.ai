import { AppError, ErrorLevel } from "@/types/actions-types"
import type { ActionState } from "@/types"
import { 
  ErrorCode, 
  TypedError,
  DatabaseError,
  AuthenticationError,
  AuthorizationError,
  ValidationError,
  ExternalServiceError,
  BusinessLogicError,
  getUserMessage,
  ERROR_STATUS_CODES
} from "@/types/error-types"
import { 
  createLogger, 
  sanitizeForLogging, 
  generateRequestId,
  getLogContext 
} from "@/lib/logger"

/**
 * Creates a structured AppError with standardized properties
 * @deprecated Use createTypedError instead for better error categorization
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
 * Creates a typed error with full context and categorization
 */
export function createTypedError<T extends TypedError>(
  code: ErrorCode,
  message: string,
  options: Partial<Omit<T, "name" | "message" | "code">> = {}
): T {
  const error = new Error(message) as T
  error.code = code
  error.level = options.level || getErrorLevelForCode(code)
  error.timestamp = new Date().toISOString()
  error.correlationId = getLogContext().requestId || generateRequestId()
  error.statusCode = ERROR_STATUS_CODES[code] || 500
  error.userMessage = options.userMessage || getUserMessage(code)
  error.technicalMessage = message
  
  // Determine if error is retryable based on code
  error.retryable = isRetryableError(code)
  
  // Merge additional options
  Object.assign(error, options)
  
  // Capture stack trace
  if (Error.captureStackTrace) {
    Error.captureStackTrace(error, createTypedError)
  }
  
  return error
}

/**
 * Factory functions for creating specific error types
 */
export const ErrorFactories = {
  // Database Errors
  dbConnectionFailed: (details?: Partial<DatabaseError>) =>
    createTypedError<DatabaseError>(
      ErrorCode.DB_CONNECTION_FAILED,
      details?.technicalMessage || "Failed to connect to database",
      details
    ),
  
  dbQueryFailed: (query: string, error?: Error, details?: Partial<DatabaseError>) =>
    createTypedError<DatabaseError>(
      ErrorCode.DB_QUERY_FAILED,
      `Query failed: ${error?.message || "Unknown error"}`,
      { ...details, details: { ...details?.details, query }, cause: error }
    ),
  
  dbRecordNotFound: (table: string, id: unknown, details?: Partial<DatabaseError>) =>
    createTypedError<DatabaseError>(
      ErrorCode.DB_RECORD_NOT_FOUND,
      `Record not found in ${table} with id: ${id}`,
      { table, details: { id }, ...details }
    ),
  
  dbDuplicateEntry: (table: string, field: string, value: unknown, details?: Partial<DatabaseError>) =>
    createTypedError<DatabaseError>(
      ErrorCode.DB_DUPLICATE_ENTRY,
      `Duplicate entry in ${table}.${field}: ${value}`,
      { ...details, details: { ...details?.details, table, field, value } }
    ),
  
  // Authentication Errors
  authNoSession: (details?: Partial<AuthenticationError>) =>
    createTypedError<AuthenticationError>(
      ErrorCode.AUTH_NO_SESSION,
      "No active session found",
      details
    ),
  
  authInvalidToken: (tokenType?: string, details?: Partial<AuthenticationError>) =>
    createTypedError<AuthenticationError>(
      ErrorCode.AUTH_INVALID_TOKEN,
      `Invalid ${tokenType || "authentication"} token`,
      details
    ),
  
  authExpiredSession: (expiredAt?: string, details?: Partial<AuthenticationError>) =>
    createTypedError<AuthenticationError>(
      ErrorCode.AUTH_EXPIRED_SESSION,
      `Session expired${expiredAt ? ` at ${expiredAt}` : ""}`,
      { expiresAt: expiredAt, ...details }
    ),
  
  // Authorization Errors
  authzInsufficientPermissions: (requiredRole?: string, userRoles?: string[], details?: Partial<AuthorizationError>) =>
    createTypedError<AuthorizationError>(
      ErrorCode.AUTHZ_INSUFFICIENT_PERMISSIONS,
      `Insufficient permissions${requiredRole ? `. Required: ${requiredRole}` : ""}`,
      { requiredRole, userRoles, ...details }
    ),
  
  authzResourceNotFound: (resourceType: string, resourceId: string, details?: Partial<AuthorizationError>) =>
    createTypedError<AuthorizationError>(
      ErrorCode.AUTHZ_RESOURCE_NOT_FOUND,
      `${resourceType} not found or access denied: ${resourceId}`,
      { resourceType, resourceId, ...details }
    ),
  
  authzAdminRequired: (operation?: string, details?: Partial<AuthorizationError>) =>
    createTypedError<AuthorizationError>(
      ErrorCode.AUTHZ_ADMIN_REQUIRED,
      `Administrator privileges required${operation ? ` for ${operation}` : ""}`,
      { requiredRole: "administrator", ...details }
    ),
  
  authzToolAccessDenied: (toolName: string, details?: Partial<AuthorizationError>) =>
    createTypedError<AuthorizationError>(
      ErrorCode.AUTHZ_TOOL_ACCESS_DENIED,
      `Access denied to tool: ${toolName}`,
      { requiredPermission: toolName, ...details }
    ),
  
  authzOwnerRequired: (operation: string, details?: Partial<AuthorizationError>) =>
    createTypedError<AuthorizationError>(
      ErrorCode.AUTHZ_OWNER_REQUIRED,
      `Only the owner can ${operation}`,
      { requiredRole: "owner", ...details }
    ),
  
  // Validation Errors
  validationFailed: (fields: ValidationError["fields"], details?: Partial<ValidationError>) =>
    createTypedError<ValidationError>(
      ErrorCode.VALIDATION_FAILED,
      `Validation failed for ${fields?.length || 0} field(s)`,
      { fields, ...details }
    ),
  
  invalidInput: (field: string, value: unknown, constraint?: string, details?: Partial<ValidationError>) =>
    createTypedError<ValidationError>(
      ErrorCode.INVALID_INPUT,
      `Invalid input for ${field}`,
      { 
        fields: [{ field, value, message: `Invalid value`, constraint }],
        ...details 
      }
    ),
  
  missingRequiredField: (field: string, details?: Partial<ValidationError>) =>
    createTypedError<ValidationError>(
      ErrorCode.MISSING_REQUIRED_FIELD,
      `Missing required field: ${field}`,
      { 
        fields: [{ field, message: "Field is required" }],
        ...details 
      }
    ),
  
  // External Service Errors
  externalServiceError: (serviceName: string, error?: Error, details?: Partial<ExternalServiceError>) =>
    createTypedError<ExternalServiceError>(
      ErrorCode.EXTERNAL_SERVICE_ERROR,
      `External service error: ${serviceName} - ${error?.message || "Unknown error"}`,
      { serviceName, cause: error, ...details }
    ),
  
  externalServiceTimeout: (serviceName: string, timeout: number = 30000, details?: Partial<ExternalServiceError>) =>
    createTypedError<ExternalServiceError>(
      ErrorCode.EXTERNAL_SERVICE_TIMEOUT,
      `${serviceName} timeout after ${timeout}ms`,
      { serviceName, responseTime: timeout, ...details }
    ),
  
  externalApiRateLimit: (serviceName: string, retryAfter?: number, details?: Partial<ExternalServiceError>) =>
    createTypedError<ExternalServiceError>(
      ErrorCode.EXTERNAL_API_RATE_LIMIT,
      `Rate limit exceeded for ${serviceName}${retryAfter ? `. Retry after ${retryAfter}s` : ''}`,
      { serviceName, nextRetryAt: retryAfter ? new Date(Date.now() + retryAfter * 1000).toISOString() : undefined, ...details }
    ),
  
  // Additional Validation Errors
  invalidFormat: (field: string, value: unknown, expectedFormat: string, details?: Partial<ValidationError>) =>
    createTypedError<ValidationError>(
      ErrorCode.INVALID_FORMAT,
      `Invalid format for ${field}. Expected: ${expectedFormat}`,
      { 
        fields: [{ field, value, message: `Invalid format. Expected: ${expectedFormat}`, constraint: expectedFormat }],
        ...details 
      }
    ),
  
  valueOutOfRange: (field: string, value: number, min: number, max: number, details?: Partial<ValidationError>) =>
    createTypedError<ValidationError>(
      ErrorCode.VALUE_OUT_OF_RANGE,
      `${field} value ${value} is out of range [${min}, ${max}]`,
      { 
        fields: [{ field, value, message: `Value must be between ${min} and ${max}`, constraint: `${min}-${max}` }],
        ...details 
      }
    ),
  
  invalidFileType: (field: string, actualType: string, allowedTypes: string[], details?: Partial<ValidationError>) =>
    createTypedError<ValidationError>(
      ErrorCode.INVALID_FILE_TYPE,
      `Invalid file type for ${field}. Got: ${actualType}, Allowed: ${allowedTypes.join(', ')}`,
      { 
        fields: [{ field, value: actualType, message: `File type must be one of: ${allowedTypes.join(', ')}`, constraint: allowedTypes.join(',') }],
        ...details 
      }
    ),
  
  fileTooLarge: (field: string, actualSize: number, maxSize: number, details?: Partial<ValidationError>) =>
    createTypedError<ValidationError>(
      ErrorCode.FILE_TOO_LARGE,
      `File ${field} is too large. Size: ${actualSize} bytes, Max: ${maxSize} bytes`,
      { 
        fields: [{ field, value: actualSize, message: `File size must not exceed ${maxSize} bytes`, constraint: `max:${maxSize}` }],
        ...details 
      }
    ),
  
  // System Errors
  sysInternalError: (message: string, details?: Record<string, unknown>) =>
    createTypedError<TypedError>(
      ErrorCode.SYS_INTERNAL_ERROR,
      message,
      details
    ),
  
  sysConfigurationError: (message: string, details?: Record<string, unknown>) =>
    createTypedError<TypedError>(
      ErrorCode.SYS_CONFIGURATION_ERROR,
      message,
      details
    ),
  
  // Business Logic Errors
  bizInvalidState: (operation: string, currentState: string, expectedState: string, details?: Partial<BusinessLogicError>) =>
    createTypedError<BusinessLogicError>(
      ErrorCode.BIZ_INVALID_STATE,
      `Invalid state for ${operation}. Current: ${currentState}, Expected: ${expectedState}`,
      { operation, currentState, expectedState, ...details }
    ),
  
  bizQuotaExceeded: (operation: string, limit: number, current: number, resetAt?: string, details?: Partial<BusinessLogicError>) =>
    createTypedError<BusinessLogicError>(
      ErrorCode.BIZ_QUOTA_EXCEEDED,
      `Quota exceeded for ${operation}. Limit: ${limit}, Current: ${current}`,
      { operation, quota: { limit, current, resetAt }, ...details }
    ),

  // Streaming and Provider Errors
  providerUnavailable: (provider: string, details?: Partial<ExternalServiceError>) =>
    createTypedError<ExternalServiceError>(
      ErrorCode.EXTERNAL_SERVICE_ERROR,
      `Provider ${provider} is currently unavailable`,
      { serviceName: provider, ...details }
    ),
}

/**
 * Determines the error level based on error code
 */
function getErrorLevelForCode(code: ErrorCode): ErrorLevel {
  // Authentication errors are typically warnings
  if (code.startsWith("AUTH_")) {
    return ErrorLevel.WARN
  }
  
  // Authorization errors are warnings
  if (code.startsWith("AUTHZ_")) {
    return ErrorLevel.WARN
  }
  
  // Validation errors are info level
  if (code.startsWith("VALIDATION_") || 
      code === ErrorCode.INVALID_INPUT ||
      code === ErrorCode.MISSING_REQUIRED_FIELD ||
      code === ErrorCode.INVALID_FORMAT ||
      code === ErrorCode.VALUE_OUT_OF_RANGE ||
      code === ErrorCode.INVALID_FILE_TYPE ||
      code === ErrorCode.FILE_TOO_LARGE) {
    return ErrorLevel.INFO
  }
  
  // System errors are fatal
  if (code.startsWith("SYS_")) {
    return ErrorLevel.FATAL
  }
  
  // Default to ERROR level
  return ErrorLevel.ERROR
}

/**
 * Determines if an error is retryable
 */
function isRetryableError(code: ErrorCode): boolean {
  const retryableCodes = [
    ErrorCode.DB_CONNECTION_FAILED,
    ErrorCode.DB_TIMEOUT,
    ErrorCode.DB_POOL_EXHAUSTED,
    ErrorCode.EXTERNAL_SERVICE_TIMEOUT,
    ErrorCode.EXTERNAL_API_RATE_LIMIT,
    ErrorCode.AWS_SERVICE_ERROR,
    ErrorCode.S3_UPLOAD_FAILED,
    ErrorCode.S3_DOWNLOAD_FAILED,
    ErrorCode.LAMBDA_INVOCATION_FAILED,
  ]
  
  return retryableCodes.includes(code)
}

/**
 * Enhanced error handler with comprehensive logging and categorization
 */
export function handleError(
  error: unknown, 
  userMessage = "An unexpected error occurred",
  logOptions: {
    context?: string;
    requestId?: string;
    userId?: string;
    includeErrorInResponse?: boolean;
    operation?: string;
    metadata?: Record<string, unknown>;
  } = {}
): ActionState<never> {
  const { 
    context = '', 
    requestId = getLogContext().requestId || generateRequestId(),
    userId = getLogContext().userId,
    includeErrorInResponse = process.env.NODE_ENV !== "production",
    operation,
    metadata
  } = logOptions
  
  // Create a child logger with context
  const log = createLogger({ 
    requestId, 
    userId, 
    context,
    operation 
  })
  
  // Handle TypedError
  if (error instanceof Error && "code" in error) {
    const typedError = error as TypedError
    
    // Sanitize error details for logging
    const sanitizedDetails = sanitizeForLogging({
      code: typedError.code,
      details: typedError.details,
      statusCode: typedError.statusCode,
      retryable: typedError.retryable,
      service: typedError.service,
      operation: typedError.operation,
      ...metadata
    })
    
    // Log based on error level
    switch (typedError.level) {
      case ErrorLevel.INFO:
        log.info(typedError.technicalMessage || typedError.message, sanitizedDetails as object)
        break
      case ErrorLevel.WARN:
        log.warn(typedError.technicalMessage || typedError.message, sanitizedDetails as object)
        break
      case ErrorLevel.ERROR:
        log.error(typedError.technicalMessage || typedError.message, {
          ...(sanitizedDetails as object),
          stack: typedError.stack
        })
        break
      case ErrorLevel.FATAL:
        log.error(`FATAL: ${typedError.technicalMessage || typedError.message}`, {
          ...(sanitizedDetails as object),
          stack: typedError.stack
        })
        break
    }
    
    // Return user-friendly message
    return {
      isSuccess: false,
      message: typedError.userMessage || userMessage,
      ...(includeErrorInResponse && { 
        error: {
          code: typedError.code,
          message: typedError.message,
          details: sanitizedDetails
        }
      })
    }
  }
  
  // Handle AppError (legacy)
  if (error instanceof Error && 'level' in error && (error as AppError).level) {
    const appError = error as AppError
    
    const sanitizedDetails = sanitizeForLogging({
      details: appError.details,
      ...metadata
    })
    
    // Log based on error level
    switch (appError.level) {
      case ErrorLevel.INFO:
        log.info(appError.message, sanitizedDetails as object)
        break
      case ErrorLevel.WARN:
        log.warn(appError.message, sanitizedDetails as object)
        break
      case ErrorLevel.ERROR:
        log.error(appError.message, { ...(sanitizedDetails as object), stack: appError.stack })
        break
      case ErrorLevel.FATAL:
        log.error(`FATAL: ${appError.message}`, { ...(sanitizedDetails as object), stack: appError.stack })
        break
    }
    
    return {
      isSuccess: false,
      message: userMessage,
      ...(includeErrorInResponse && { error: appError })
    }
  }
  
  // Handle standard Error objects
  if (error instanceof Error) {
    log.error(error.message, { 
      error: sanitizeForLogging(error),
      stack: error.stack,
      ...metadata
    })
    
    return {
      isSuccess: false,
      message: userMessage,
      ...(includeErrorInResponse && { error })
    }
  }
  
  // Handle unknown error types
  log.error("Unknown error occurred", { 
    error: sanitizeForLogging(error),
    ...metadata 
  })
  
  return {
    isSuccess: false,
    message: userMessage,
    ...(includeErrorInResponse && { error })
  }
}

/**
 * Creates a success ActionState
 */
export function createSuccess<T>(data: T, message = "Operation successful"): ActionState<T> {
  return {
    isSuccess: true,
    message,
    data
  }
}

/**
 * Wraps an async function with error handling for API routes
 */
export async function withErrorHandling<T>(
  fn: () => Promise<T>,
  options?: Parameters<typeof handleError>[2]
): Promise<ActionState<T>> {
  try {
    const result = await fn()
    return createSuccess(result)
  } catch (error) {
    return handleError(error, undefined, options) as ActionState<T>
  }
}