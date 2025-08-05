# Comprehensive Logging Guide

## Table of Contents
1. [Overview](#overview)
2. [Core Concepts](#core-concepts)
3. [Implementation Patterns](#implementation-patterns)
4. [Error Handling](#error-handling)
5. [CloudWatch Integration](#cloudwatch-integration)
6. [Troubleshooting](#troubleshooting)
7. [Performance Considerations](#performance-considerations)
8. [Security Guidelines](#security-guidelines)

## Overview

This guide provides comprehensive documentation for the AI Studio logging system, which has been designed to provide structured, searchable, and actionable logs for both development and production environments.

### Key Features
- **Request ID Tracking**: Every operation gets a unique ID for end-to-end tracing
- **Structured Logging**: JSON format in production for CloudWatch Insights
- **Sensitive Data Filtering**: Automatic redaction of passwords, tokens, and PII
- **Performance Metrics**: Built-in timing for all operations
- **Error Categorization**: Typed errors with appropriate severity levels
- **User Context**: Automatic injection of user information

## Core Concepts

### Request ID
Every server action and API route generates a unique request ID using nanoid:
```typescript
const requestId = generateRequestId() // e.g., "V1StGXR8Z5"
```

This ID propagates through all operations, making it easy to trace issues across multiple log entries.

### Log Context
The logging system uses AsyncLocalStorage to maintain context across async operations:
```typescript
const log = createLogger({
  requestId,
  userId,
  action: "actionName",
  metadata: { additional: "context" }
})
```

### Log Levels
- **DEBUG**: Detailed information for debugging (hidden in production)
- **INFO**: Important business events
- **WARN**: Warning conditions that should be investigated
- **ERROR**: Error conditions requiring immediate attention
- **FATAL**: Critical system failures

## Implementation Patterns

### Server Actions

#### Basic Pattern
```typescript
"use server"

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
import { getServerSession } from "@/lib/auth/server-session"
import { ActionState } from "@/types"

export async function myServerAction(
  params: MyParams
): Promise<ActionState<MyResult>> {
  const requestId = generateRequestId()
  const timer = startTimer("myServerAction")
  const log = createLogger({ 
    requestId, 
    action: "myServerAction" 
  })
  
  try {
    log.info("Action started", { 
      params: sanitizeForLogging(params) 
    })
    
    // Authentication check
    const session = await getServerSession()
    if (!session) {
      log.warn("Unauthorized access attempt")
      throw ErrorFactories.authNoSession()
    }
    
    log.debug("User authenticated", { 
      userId: session.sub 
    })
    
    // Business logic
    const result = await performOperation(params)
    
    // Success logging
    timer({ status: "success", resultCount: result.length })
    log.info("Action completed successfully")
    
    return createSuccess(result, "Operation completed successfully")
    
  } catch (error) {
    timer({ status: "error" })
    
    return handleError(
      error, 
      "Failed to complete operation. Please try again.",
      {
        context: "myServerAction",
        requestId,
        operation: "myServerAction"
      }
    )
  }
}
```

#### Using the Helper Pattern
```typescript
import { withLogging } from "@/lib/logging-helpers"

export const myServerAction = withLogging(
  async (params: MyParams, context) => {
    const { log, session } = context
    
    log.debug("Processing request", { params })
    
    const result = await performOperation(params)
    
    log.info("Operation completed", { 
      resultCount: result.length 
    })
    
    return result
  },
  {
    actionName: "myServerAction",
    requireAuth: true,
    sanitizeParams: (params) => ({
      ...params,
      sensitiveField: "[REDACTED]"
    })
  }
)
```

### API Routes

```typescript
import { withApiLogging } from "@/lib/logging-helpers"

export async function POST(request: Request) {
  return withApiLogging(request, "myApiRoute", async (log) => {
    const body = await request.json()
    
    log.info("Processing API request", { 
      body: sanitizeForLogging(body) 
    })
    
    const result = await processRequest(body)
    
    log.info("API request completed", { 
      resultId: result.id 
    })
    
    return result
  })
}
```

### Database Operations

```typescript
import { withDatabaseLogging } from "@/lib/logging-helpers"

async function getUserById(userId: number) {
  return withDatabaseLogging("getUserById", async () => {
    const query = "SELECT * FROM users WHERE id = :id"
    const params = [{ name: "id", value: { longValue: userId } }]
    
    const result = await executeSQL(query, params)
    
    if (result.length === 0) {
      throw ErrorFactories.dbRecordNotFound("users", userId)
    }
    
    return result[0]
  })
}
```

## Error Handling

### Error Categories

#### Authentication Errors (AUTH_*)
```typescript
// No session
throw ErrorFactories.authNoSession()

// Invalid token
throw ErrorFactories.authInvalidToken("JWT")

// Expired session
throw ErrorFactories.authExpiredSession(expiryDate)
```

#### Authorization Errors (AUTHZ_*)
```typescript
// Insufficient permissions
throw ErrorFactories.authzInsufficientPermissions("admin", userRoles)

// Resource not found or no access
throw ErrorFactories.authzResourceNotFound("repository", repoId)

// Admin required
throw ErrorFactories.authzAdminRequired("deleteUser")
```

#### Database Errors (DB_*)
```typescript
// Connection failed
throw ErrorFactories.dbConnectionFailed()

// Query failed
throw ErrorFactories.dbQueryFailed(query, originalError)

// Record not found
throw ErrorFactories.dbRecordNotFound("users", userId)

// Duplicate entry
throw ErrorFactories.dbDuplicateEntry("users", "email", email)
```

#### Validation Errors (VALIDATION_*)
```typescript
// Field validation
throw ErrorFactories.validationFailed([
  { field: "email", message: "Invalid email format" },
  { field: "age", message: "Must be 18 or older" }
])

// Missing required field
throw ErrorFactories.missingRequiredField("email")

// Invalid input
throw ErrorFactories.invalidInput("age", -5, "positive integer")
```

#### External Service Errors (EXTERNAL_*)
```typescript
// Service error
throw ErrorFactories.externalServiceError("OpenAI", error)

// Timeout
throw ErrorFactories.externalServiceTimeout("AWS S3", 30000)
```

### Error Response Format

Errors are returned in a consistent format:
```typescript
{
  isSuccess: false,
  message: "User-friendly error message",
  error?: {
    code: "ERROR_CODE",
    message: "Technical message",
    details: { /* context */ }
  }
}
```

## CloudWatch Integration

### Log Format in Production

All logs in production are formatted as structured JSON:
```json
{
  "timestamp": "2025-01-05T10:00:00.000Z",
  "level": "error",
  "message": "Database query failed",
  "requestId": "V1StGXR8Z5",
  "userId": "user-123",
  "action": "getUserDetails",
  "code": "DB_QUERY_FAILED",
  "query": "SELECT * FROM users WHERE id = :id",
  "parameters": { "id": 123 },
  "duration": 1500,
  "stack": "Error: ...",
  "environment": "production",
  "region": "us-east-1"
}
```

### CloudWatch Insights Queries

#### Find all errors for a specific user
```
fields @timestamp, message, requestId, error.code
| filter userId = "user-123"
| filter level = "error"
| sort @timestamp desc
```

#### Track slow operations
```
fields @timestamp, action, duration, userId
| filter duration > 3000
| stats avg(duration) as avg_duration by action
```

#### Error rate by error code
```
fields @timestamp, error.code
| filter level = "error"
| stats count() by error.code
| sort count desc
```

#### Trace a specific request
```
fields @timestamp, level, message, action
| filter requestId = "V1StGXR8Z5"
| sort @timestamp asc
```

#### Find authentication failures
```
fields @timestamp, userId, message, requestId
| filter error.code like /AUTH_/
| sort @timestamp desc
| limit 100
```

### Setting Up Alarms

Create CloudWatch alarms for critical errors:

```typescript
// Example alarm for high error rate
{
  AlarmName: "HighErrorRate",
  MetricName: "ErrorCount",
  Namespace: "AIStudio/Logs",
  Statistic: "Sum",
  Period: 300, // 5 minutes
  EvaluationPeriods: 2,
  Threshold: 50,
  ComparisonOperator: "GreaterThanThreshold"
}
```

## Troubleshooting

### Common Issues and Solutions

#### Issue: Generic "DB error" messages
**Solution**: Use typed error factories
```typescript
// ❌ Bad
catch (error) {
  return { isSuccess: false, message: "DB error" }
}

// ✅ Good
catch (error) {
  return handleError(
    ErrorFactories.dbQueryFailed(query, error),
    "Failed to load data. Please try again.",
    { context: "loadUserData", requestId }
  )
}
```

#### Issue: Missing request context in logs
**Solution**: Always create a logger with context
```typescript
// ❌ Bad
logger.info("Operation completed")

// ✅ Good
const log = createLogger({ requestId, action: "myAction" })
log.info("Operation completed")
```

#### Issue: Sensitive data in logs
**Solution**: Use sanitizeForLogging
```typescript
// ❌ Bad
log.info("User data", { user })

// ✅ Good
log.info("User data", { user: sanitizeForLogging(user) })
```

### Debug Mode

Enable debug logging in development:
```typescript
// Set in .env.local
LOG_LEVEL=debug
```

### Correlation Across Services

Use request ID to correlate logs across different services:
```typescript
// Pass request ID to external services
const response = await fetch(url, {
  headers: {
    "X-Request-ID": requestId
  }
})
```

## Performance Considerations

### Log Sampling

For high-volume operations, implement log sampling:
```typescript
const shouldLog = Math.random() < 0.1 // Log 10% of requests

if (shouldLog) {
  log.debug("High-volume operation", { data })
}
```

### Async Logging

Logs are written asynchronously to avoid blocking:
```typescript
// Logs don't block execution
log.info("Operation started") // Non-blocking
const result = await heavyOperation() // Continues immediately
```

### Log Retention

Configure appropriate retention policies:
- Development: 7 days
- Production: 30 days
- Audit logs: 90 days

## Security Guidelines

### Sensitive Data Filtering

The logger automatically filters:
- Passwords
- API keys
- Tokens
- Cognito subs
- Email addresses (masked to ***@domain.com)

### Custom Filtering

Add custom patterns for your specific needs:
```typescript
const CUSTOM_PATTERNS = [
  /ssn["\s]*[:=]\s*["']?[^"'\s,}]+/gi,
  /credit[_-]?card["\s]*[:=]\s*["']?[^"'\s,}]+/gi
]
```

### Audit Logging

For sensitive operations, create audit logs:
```typescript
function logAuditEvent(
  action: string,
  resourceType: string,
  resourceId: string,
  outcome: "success" | "failure"
) {
  const log = createLogger({ 
    type: "audit",
    action,
    resourceType,
    resourceId
  })
  
  log.info(`Audit: ${action} ${resourceType}`, {
    outcome,
    timestamp: new Date().toISOString()
  })
}
```

### GDPR Compliance

Ensure PII is handled appropriately:
- Don't log full user details
- Use user IDs instead of emails where possible
- Implement log deletion for user data requests

## Best Practices

1. **Always use request IDs** for tracing
2. **Log at appropriate levels** (don't use ERROR for warnings)
3. **Include context** in every log message
4. **Sanitize user input** before logging
5. **Use structured metadata** instead of string concatenation
6. **Track performance** with timers
7. **Handle errors with proper categorization**
8. **Write actionable error messages** for users
9. **Include technical details** in logs (not user messages)
10. **Test logging** in both development and production modes

## Migration Checklist

When updating existing code to use the new logging system:

- [ ] Replace all `console.log` with appropriate logger calls
- [ ] Add request ID generation to all server actions
- [ ] Replace generic errors with typed error factories
- [ ] Add performance timers to key operations
- [ ] Implement proper error handling with user-friendly messages
- [ ] Add authentication/authorization logging
- [ ] Sanitize all user input before logging
- [ ] Test error scenarios
- [ ] Verify CloudWatch integration in staging
- [ ] Update monitoring dashboards

## Examples Repository

For more examples, check the following files:
- `/actions/db/get-current-user-action.ts` - Comprehensive server action logging
- `/lib/logging-helpers.ts` - Reusable logging patterns
- `/lib/error-utils.ts` - Error handling utilities
- `/types/error-types.ts` - Error type definitions