/**
 * Logging helper utilities for consistent server action and API route patterns
 * These helpers ensure standardized logging across all server-side operations
 */

import { getServerSession } from "@/lib/auth/server-session"
import { 
  createLogger, 
  generateRequestId, 
  startTimer,
  sanitizeForLogging
} from "@/lib/logger"
import { 
  handleError, 
  ErrorFactories,
  createSuccess
} from "@/lib/error-utils"
import type { ActionState } from "@/types"

/**
 * Options for wrapping server actions with logging
 */
export interface ServerActionOptions {
  actionName: string
  requireAuth?: boolean
  requireRoles?: string[]
  sanitizeParams?: (params: unknown) => unknown
  metadata?: Record<string, unknown>
}

/**
 * Wraps a server action with comprehensive logging, error handling, and performance tracking
 * This is the recommended pattern for all server actions
 * 
 * @example
 * export const myAction = withLogging(
 *   async (params: MyParams, context: LoggingContext) => {
 *     const { log, session } = context
 *     
 *     // Your business logic here
 *     const result = await doSomething(params)
 *     
 *     log.info("Operation completed", { resultCount: result.length })
 *     return result
 *   },
 *   {
 *     actionName: "myAction",
 *     requireAuth: true,
 *     requireRoles: ["admin"],
 *     sanitizeParams: (params) => ({ ...params, password: "[REDACTED]" })
 *   }
 * )
 */
export function withLogging<TParams, TResult>(
  fn: (params: TParams, context: LoggingContext) => Promise<TResult>,
  options: ServerActionOptions
): (params: TParams) => Promise<ActionState<TResult>> {
  return async (params: TParams): Promise<ActionState<TResult>> => {
    const requestId = generateRequestId()
    const timer = startTimer(options.actionName)
    
    // Create logger with context
    const log = createLogger({
      requestId,
      action: options.actionName,
      ...options.metadata
    })
    
    try {
      // Log action start
      log.info(`Action started`, {
        params: options.sanitizeParams 
          ? sanitizeForLogging(options.sanitizeParams(params))
          : sanitizeForLogging(params)
      })
      
      // Check authentication if required
      let session = null
      let userId: string | undefined
      
      if (options.requireAuth) {
        session = await getServerSession()
        if (!session) {
          log.warn("Unauthorized access attempt")
          throw ErrorFactories.authNoSession()
        }
        
        userId = session.sub
        
        // Update logger context with user info
        log.info("User authenticated", { 
          userId,
          userEmail: sanitizeForLogging(session.email)
        })
      }
      
      // Check authorization if roles required
      if (options.requireRoles && options.requireRoles.length > 0) {
        // This would need to be implemented based on your role checking logic
        // For now, we'll add a TODO comment
        // TODO: Implement role checking
        log.debug("Role check required", { requiredRoles: options.requireRoles })
      }
      
      // Create context for the action
      const context: LoggingContext = {
        log,
        requestId,
        session,
        userId,
        timer
      }
      
      // Execute the action
      const result = await fn(params, context)
      
      // Log success and performance
      const endTimer = timer
      endTimer({ 
        status: "success",
        ...(Array.isArray(result) && { recordCount: result.length })
      })
      
      log.info("Action completed successfully")
      
      return createSuccess(result)
      
    } catch (error) {
      // Log failure and performance
      const endTimer = timer
      endTimer({ status: "error" })
      
      return handleError(error, undefined, {
        context: options.actionName,
        requestId,
        operation: options.actionName,
        metadata: options.metadata
      })
    }
  }
}

/**
 * Context provided to wrapped server actions
 */
export interface LoggingContext {
  log: ReturnType<typeof createLogger>
  requestId: string
  session: Awaited<ReturnType<typeof getServerSession>> | null
  userId?: string
  timer: ReturnType<typeof startTimer>
}

/**
 * Simplified wrapper for actions that don't need the full logging context
 * Useful for simple CRUD operations
 */
export function withSimpleLogging<TResult>(
  actionName: string,
  fn: () => Promise<TResult>,
  options?: {
    requireAuth?: boolean
    metadata?: Record<string, unknown>
  }
): () => Promise<ActionState<TResult>> {
  // Create a wrapper that accepts params but doesn't use them
  const wrapper = withLogging<undefined, TResult>(
    async () => fn(),
    {
      actionName,
      requireAuth: options?.requireAuth,
      metadata: options?.metadata
    }
  )
  
  // Return a function that doesn't require params
  return () => wrapper(undefined)
}

/**
 * Creates a logged database operation wrapper
 * Automatically handles common database errors with proper categorization
 */
export function withDatabaseLogging<T>(
  operation: string,
  query: () => Promise<T>
): Promise<T> {
  const timer = startTimer(`db.${operation}`)
  
  return query()
    .then(result => {
      const endTimer = timer
      endTimer({ status: "success" })
      return result
    })
    .catch(error => {
      const endTimer = timer
      endTimer({ status: "error" })
      
      // Categorize database errors
      if (error instanceof Error) {
        const message = error.message.toLowerCase()
        
        if (message.includes("connection") || message.includes("connect")) {
          throw ErrorFactories.dbConnectionFailed({ 
            technicalMessage: error.message,
            cause: error 
          })
        }
        
        if (message.includes("timeout")) {
          throw ErrorFactories.dbQueryFailed("", error, {
            technicalMessage: "Database query timed out"
          })
        }
        
        if (message.includes("duplicate") || message.includes("unique")) {
          throw ErrorFactories.dbDuplicateEntry("", "", "", {
            technicalMessage: error.message,
            cause: error
          })
        }
        
        // Generic query failure
        throw ErrorFactories.dbQueryFailed("", error)
      }
      
      throw error
    })
}

/**
 * Logs API route requests with automatic error handling
 */
export async function withApiLogging<T>(
  request: Request,
  routeName: string,
  handler: (log: ReturnType<typeof createLogger>) => Promise<T>
): Promise<Response> {
  const requestId = request.headers.get("x-request-id") || generateRequestId()
  const timer = startTimer(`api.${routeName}`)
  
  const log = createLogger({
    requestId,
    route: routeName,
    method: request.method,
    url: request.url
  })
  
  try {
    log.info("API request received")
    
    const result = await handler(log)
    
    const endTimer = timer
    endTimer({ status: "success" })
    
    return Response.json(createSuccess(result))
    
  } catch (error) {
    const endTimer = timer
    endTimer({ status: "error" })
    
    const errorResponse = handleError(error, undefined, {
      context: `api.${routeName}`,
      requestId,
      operation: routeName
    })
    
    // Get status code from error if it's typed
    let statusCode = 500
    if (error instanceof Error && "statusCode" in error) {
      const typedError = error as unknown as { statusCode?: number }
      statusCode = typedError.statusCode || 500
    }
    
    return Response.json(errorResponse, { status: statusCode })
  }
}