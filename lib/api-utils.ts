import { NextResponse } from 'next/server';
import { handleError } from './error-utils';

/**
 * Wrapper for API route handlers to standardize error handling
 * @param handler The route handler function
 * @returns A function that catches errors and returns standardized responses
 */
export function withErrorHandling<T>(
  handler: () => Promise<T>
): Promise<NextResponse> {
  return handler()
    .then((data) => {
      return NextResponse.json({ 
        success: true, 
        data 
      });
    })
    .catch((error) => {
      // Use the common error handler for logging
      const result = handleError(error, "API request failed", {
        context: "API",
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
      
      return NextResponse.json(
        {
          success: false,
          message: result.message,
          ...(result.error && { error: result.error })
        }, 
        { status: statusCode }
      );
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