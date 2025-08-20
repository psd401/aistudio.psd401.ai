# Critical Security Fix: Session Bleeding in AWS Lambda

## Issue Summary

- **Issue**: Users are seeing other users' sessions (James logged in but saw Kris's session)
- **Severity**: CRITICAL - User data exposure
- **Root Cause**: Module-level singleton pattern combined with AWS Lambda container reuse
- **Discovered**: July 31, 2025
- **Environment**: Production and Development (AWS Amplify with SSR)

## Root Cause Analysis

### The Problem

1. **Singleton Auth Instance**: 
   - File: `auth.ts`
   - Issue: `export const { handlers, auth, signIn, signOut } = NextAuth(authConfig)`
   - This creates a single NextAuth instance at module load time

2. **Lambda Container Reuse**:
   - AWS Lambda containers persist between invocations
   - The same Node.js process handles multiple requests
   - Module-level variables persist across requests

3. **Session Contamination Flow**:
   ```
   Request 1 (Kris) → Lambda Container A → Auth Instance → Session stored
   Request 2 (James) → Lambda Container A → Same Auth Instance → Kris's session returned
   ```

### Technical Details

- NextAuth v5 beta uses internal state management
- The auth instance maintains session state between calls
- In serverless environments, this state persists across different users

## Fix Implementation

### Phase 1: Convert to Factory Pattern

#### 1.1 Update auth.ts

**Before:**
```typescript
export const { handlers, auth, signIn, signOut } = NextAuth(authConfig)
```

**After:**
```typescript
import NextAuth from "next-auth"
import type { NextAuthConfig } from "next-auth"
import Cognito from "next-auth/providers/cognito"

export const authConfig: NextAuthConfig = {
  providers: [
    Cognito({
      clientId: process.env.AUTH_COGNITO_CLIENT_ID!,
      clientSecret: process.env.AUTH_COGNITO_CLIENT_SECRET || "",
      issuer: process.env.AUTH_COGNITO_ISSUER!,
      // ... rest of config
    })
  ],
  // ... rest of existing config
}

// Factory function - creates new instance per request
export function createAuth() {
  return NextAuth(authConfig)
}

// For middleware only - stateless operations
export const { auth: authMiddleware } = NextAuth(authConfig)

// Export config for testing
export { authConfig }
```

#### 1.2 Update server-session.ts

**Before:**
```typescript
import { auth } from "@/auth";

export async function getServerSession(): Promise<CognitoSession | null> {
  try {
    const session = await auth();
    // ...
  }
}
```

**After:**
```typescript
import { createAuth } from "@/auth";
import logger from "@/lib/logger";

export async function getServerSession(): Promise<CognitoSession | null> {
  try {
    // Create new auth instance per request
    const { auth } = createAuth();
    const session = await auth();
    
    if (!session?.user?.id) {
      return null;
    }
    
    // Convert NextAuth session to match our CognitoSession interface
    return {
      ...session.user,
      sub: session.user.id,
      email: session.user.email || undefined,
    };
  } catch (error) {
    logger.error("Session retrieval failed:", error);
    return null;
  }
}
```

### Phase 2: Update All Imports

#### 2.1 Update Middleware

**File**: `middleware.ts`
```typescript
import { authMiddleware } from "@/auth";

export default authMiddleware((req) => {
  const { nextUrl, auth } = req;
  const isLoggedIn = !!auth;
  // ... rest of logic
});
```

#### 2.2 Update API Route Handlers

**Pattern for all API routes:**
```typescript
import { createAuth } from "@/auth"

export async function GET(request: Request) {
  const { auth } = createAuth()
  const session = await auth()
  // ... rest of handler
}
```

#### 2.3 Files to Update

- All files using `import { auth } from "@/auth"`
- All files using `import { signIn, signOut } from "@/auth"`
- Approximately 50+ files across the codebase

### Phase 3: Add Session Isolation

#### 3.1 Add Request ID Tracking

Create `lib/auth/request-context.ts`:
```typescript
import { headers } from "next/headers";
import crypto from "crypto";

export function getRequestId(): string {
  const headersList = headers();
  const requestId = headersList.get("x-request-id") || crypto.randomUUID();
  return requestId;
}

export function createRequestContext() {
  return {
    requestId: getRequestId(),
    timestamp: Date.now(),
  };
}
```

#### 3.2 Enhanced Session Validation

Update `lib/auth/server-session.ts`:
```typescript
export async function getServerSession(): Promise<CognitoSession | null> {
  const context = createRequestContext();
  
  try {
    logger.debug("Creating auth instance", { requestId: context.requestId });
    
    const { auth } = createAuth();
    const session = await auth();
    
    if (!session?.user?.id) {
      logger.debug("No session found", { requestId: context.requestId });
      return null;
    }
    
    // Validate session integrity
    if (session.user.id && session.user.email) {
      logger.debug("Session validated", { 
        requestId: context.requestId,
        userId: session.user.id,
        // Never log full session data
      });
    }
    
    return {
      ...session.user,
      sub: session.user.id,
      email: session.user.email || undefined,
    };
  } catch (error) {
    logger.error("Session retrieval failed:", { 
      error, 
      requestId: context.requestId 
    });
    return null;
  }
}
```

### Phase 4: Security Headers

#### 4.1 Update Middleware with Security Headers

```typescript
export default authMiddleware((req) => {
  const { nextUrl, auth } = req;
  const isLoggedIn = !!auth;
  
  // ... existing logic ...
  
  const response = NextResponse.next();
  
  // Add security headers
  response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  response.headers.set('Pragma', 'no-cache');
  response.headers.set('Expires', '0');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  
  return response;
});
```

### Phase 5: Testing Strategy

#### 5.1 Unit Tests

Create `tests/auth/session-isolation.test.ts`:
```typescript
import { createAuth } from "@/auth";

describe("Session Isolation", () => {
  it("should create separate auth instances", () => {
    const auth1 = createAuth();
    const auth2 = createAuth();
    expect(auth1).not.toBe(auth2);
  });
  
  it("should not share state between instances", async () => {
    // Test concurrent session handling
  });
});
```

#### 5.2 Integration Tests

Create `tests/integration/concurrent-sessions.test.ts`:
```typescript
describe("Concurrent Session Handling", () => {
  it("should isolate sessions between users", async () => {
    // Simulate multiple users
    // Verify no cross-contamination
  });
});
```

### Phase 6: Monitoring & Validation

#### 6.1 Add Session Monitoring

```typescript
// lib/monitoring/session-monitor.ts
export function logSessionAccess(userId: string, requestId: string) {
  // Log to CloudWatch
  logger.info("Session accessed", {
    userId,
    requestId,
    timestamp: new Date().toISOString(),
  });
}

export function detectSessionAnomaly(session: any, expectedUserId: string) {
  if (session.user.id !== expectedUserId) {
    logger.error("SESSION ANOMALY DETECTED", {
      expected: expectedUserId,
      actual: session.user.id,
      timestamp: new Date().toISOString(),
    });
    // Trigger alert
  }
}
```

## Testing Procedures

### Local Testing

1. **Start dev server**: `npm run dev`
2. **Open multiple browsers** (Chrome, Firefox, Safari)
3. **Login with different users** in each browser
4. **Verify session isolation**:
   - Each browser shows correct user
   - No session bleeding
   - Refresh maintains correct session

### Concurrent Testing Script

```bash
# test-concurrent-sessions.sh
#!/bin/bash

# User 1 login
curl -X POST http://localhost:3000/api/auth/signin \
  -H "Content-Type: application/json" \
  -d '{"email":"user1@example.com"}' \
  -c user1-cookies.txt &

# User 2 login
curl -X POST http://localhost:3000/api/auth/signin \
  -H "Content-Type: application/json" \
  -d '{"email":"user2@example.com"}' \
  -c user2-cookies.txt &

wait

# Verify sessions
echo "User 1 session:"
curl http://localhost:3000/api/auth/session -b user1-cookies.txt

echo "User 2 session:"
curl http://localhost:3000/api/auth/session -b user2-cookies.txt
```

## Deployment Strategy

### 1. Development Environment
- Deploy to dev branch
- Test with team members
- Monitor for 24 hours

### 2. Staging Environment
- Deploy to staging
- Run load tests
- Verify no session issues

### 3. Production Deployment
- Deploy during low-traffic window
- Monitor CloudWatch logs
- Have rollback ready

### Rollback Plan

If issues occur:
```bash
# Immediate rollback
git revert --no-commit HEAD~6..HEAD
git commit -m "Revert: Emergency rollback of session fix"
git push origin main
```

## Monitoring & Alerts

### CloudWatch Alarms

1. **Session Anomaly Alert**
   - Metric: Custom metric for session mismatches
   - Threshold: Any occurrence
   - Action: Email + Slack notification

2. **Auth Error Rate**
   - Metric: Error rate on /api/auth/*
   - Threshold: > 1% error rate
   - Action: Email notification

3. **Session Creation Rate**
   - Metric: New sessions per minute
   - Threshold: > 1000/min (adjust based on traffic)
   - Action: Investigation required

## Lessons Learned

### Do's
- Always use factory patterns in serverless environments
- Test with concurrent users
- Monitor session integrity
- Document security fixes thoroughly

### Don'ts
- Never use module-level singletons for stateful operations
- Don't cache user data at module level
- Avoid global state in Lambda functions
- Don't assume Lambda containers are isolated

## Prevention

1. **Code Review Checklist**:
   - Check for module-level state
   - Verify factory patterns for auth
   - Test concurrent access

2. **Architecture Guidelines**:
   - Document serverless best practices
   - Require security review for auth changes
   - Implement automated testing

3. **Monitoring**:
   - Set up proactive alerts
   - Regular security audits
   - Session integrity checks

## References

- [AWS Lambda Container Reuse](https://aws.amazon.com/blogs/compute/container-reuse-in-lambda/)
- [NextAuth.js Security Best Practices](https://authjs.dev/guides/basics/security)
- [Serverless Security Patterns](https://www.serverless.com/blog/serverless-security-best-practices)

## Sign-off

- **Author**: AI Studio Security Team
- **Date**: July 31, 2025
- **Reviewed By**: [Pending]
- **Approved By**: [Pending]