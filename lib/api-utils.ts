import { NextResponse } from 'next/server';
import { handleError } from './error-utils';
import { generateRequestId, startTimer, createLogger } from './logger';
import { type ActionState } from '@/types/actions-types';

/**
 * Wrapper for API route handlers to standardize error handling and logging
 * @param handler The route handler function
 * @param routeName Optional name for the route for logging
 * @returns A function that catches errors and returns standardized responses
 */
export function withErrorHandling<T>(
  handler: () => Promise<T>,
  routeName: string = 'unknown-route'
): Promise<NextResponse> {
  const requestId = generateRequestId();
  const timer = startTimer(routeName);
  const log = createLogger({ requestId, route: routeName });
  
  log.info(`API route ${routeName} started`);
  
  return handler()
    .then((data) => {
      timer({ status: 'success' });
      log.info(`API route ${routeName} completed successfully`);
      return NextResponse.json({ 
        success: true, 
        data,
        requestId 
      });
    })
    .catch((error) => {
      timer({ status: 'error' });
      // Use the common error handler for logging
      const result = handleError(error, "API request failed", {
        context: routeName,
        requestId,
        includeErrorInResponse: process.env.NODE_ENV === 'development'
      });
      
      // Determine status code based on error
      let statusCode = 500;
      
      // Check for error code property to determine status, regardless of error instance type
      // This avoids issues with instanceof across modules
      if (error && typeof error === 'object' && 'code' in error) {
        const errorCode = (error as { code?: string }).code;
        switch (errorCode) {
          case 'UNAUTHORIZED':
            statusCode = 401;
            break;
          case 'FORBIDDEN':
            statusCode = 403;
            break;
          case 'NOT_FOUND':
            statusCode = 404;
            break;
          case 'VALIDATION':
            statusCode = 400;
            break;
          case 'CONFLICT':
            statusCode = 409;
            break;
          default:
            statusCode = 500;
        }
      }
      
      const errorData: { success: boolean; message: string; error?: unknown } = {
        success: false,
        message: result.message
      };
      
      if ((result as { error?: unknown }).error) {
        errorData.error = (result as { error?: unknown }).error;
      }
      
      return NextResponse.json(errorData, { status: statusCode });
    });
}

/**
 * Wrapper for API route handlers using ActionState pattern
 * @param handler The route handler function that returns ActionState
 * @returns A NextResponse with proper status codes
 */
export function withActionState<T>(
  handler: () => Promise<ActionState<T>>
): Promise<NextResponse> {
  return handler()
    .then((result) => {
      if (result.isSuccess) {
        return NextResponse.json(result);
      } else {
        // Determine status code based on error message or default to 400
        let statusCode = 400;
        if (result.message.toLowerCase().includes('unauthorized')) {
          statusCode = 401;
        } else if (result.message.toLowerCase().includes('forbidden') || result.message.toLowerCase().includes('access denied')) {
          statusCode = 403;
        } else if (result.message.toLowerCase().includes('not found')) {
          statusCode = 404;
        }
        
        return NextResponse.json(result, { status: statusCode });
      }
    })
    .catch((error) => {
      const result = handleError(error, "API request failed");
      return NextResponse.json(result, { status: 500 });
    });
}

/**
 * Creates an unauthorized response
 */
export function unauthorized(message = 'Unauthorized') {
  return NextResponse.json(
    { 
      success: false, 
      message 
    }, 
    { status: 401 }
  );
}

/**
 * Creates a forbidden response
 */
export function forbidden(message = 'Forbidden') {
  return NextResponse.json(
    { 
      success: false, 
      message 
    }, 
    { status: 403 }
  );
}

/**
 * Creates a not found response
 */
export function notFound(message = 'Not found') {
  return NextResponse.json(
    { 
      success: false, 
      message 
    }, 
    { status: 404 }
  );
}

/**
 * Creates a bad request response
 */
export function badRequest(message = 'Bad request') {
  return NextResponse.json(
    { 
      success: false, 
      message 
    }, 
    { status: 400 }
  );
}