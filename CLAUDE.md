# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Type Safety and Code Quality Requirements

**CRITICAL**: All code changes MUST be type-safe and pass linting checks:
- Write fully type-safe TypeScript code - no `any` types, proper type annotations
- All code MUST pass `npm run lint` without errors or warnings for the ENTIRE codebase, not just modified files
- All code MUST pass TypeScript type checking without errors for the ENTIRE codebase, not just modified files
- Never modify linting rules or type checking configuration to bypass errors
- Fix the code to meet the standards, don't lower the standards
- Run linting and type checking on the ENTIRE codebase before considering any task complete
- Both `npm run lint` and `npm run typecheck` must pass with zero errors before any commit

## ⚠️ CRITICAL DATABASE WARNING ⚠️

**NEVER MODIFY SQL SCHEMA FILES WITHOUT EXTREME CAUTION!**

The database initialization system has TWO modes:
1. **Fresh Install**: Runs files 001-005 on empty databases
2. **Existing Database**: ONLY runs migration files (010+)

**CRITICAL RULES:**
- Files 001-005 MUST exactly match the June 2025 production database structure
- NEVER modify these files based on application code expectations
- ALWAYS use MCP tools to verify database structure before changing SQL files
- Migration files (010+) should ONLY create new objects, never modify existing ones

**IMPORTANT: Adding Database Migrations**
When creating a new migration file:
1. Create the SQL file in `/infra/database/schema/` (e.g., `016-feature-name.sql`)
2. **CRITICAL**: Add the filename to the `MIGRATION_FILES` array in `/infra/database/lambda/db-init-handler.ts`
3. Build and deploy: `cd infra && npm run build && npx cdk deploy DatabaseStack`

Without step 2, your migration will NOT run even if the SQL file exists!

**If you need to check database structure:**
```bash
# Use MCP tools, NOT file inspection:
mcp__awslabs_postgres-mcp-server__get_table_schema
mcp__awslabs_postgres-mcp-server__run_query

# NEVER trust the application code's expectations of database structure
# NEVER search files for database schema - use MCP tools
```

**Database Restoration Incident (July 2025):**
- SQL files were wrong and didn't match actual database
- Running CDK deployment destroyed database columns
- Had to restore from snapshot and fix all SQL files
- See `/docs/database-restoration/` for full incident details

## Build, Lint, Test Commands

```bash
# Development
npm run dev               # Start dev server on port 3000

# Build & Production
npm run build             # Build for production (Next.js)
npm run start             # Start production server

# Code Quality Checks (MUST PASS)
npm run lint              # Run Next.js linting - MUST have zero errors
npm run typecheck         # Run TypeScript type checking (if available)

# Testing
npm run test              # Run all tests
npm run test:watch        # Run tests in watch mode
npm test -- path/to/test.test.ts  # Run a single test file

# CDK Infrastructure (from /infra directory)
cd infra
npm run build            # Compile TypeScript
npx cdk diff            # Show changes
npx cdk deploy          # Deploy stack
npx cdk deploy --all    # Deploy all stacks

# User Management
# Use AWS RDS Query Editor for user management tasks
# See docs/DEPLOYMENT.md section "First Administrator Setup"
```

## High-Level Architecture

### Application Stack
- **Framework**: Next.js 15+ with App Router
- **Authentication**: AWS Cognito + NextAuth v5 (JWT strategy)
- **Database**: AWS Aurora Serverless v2 PostgreSQL via RDS Data API
- **Hosting**: AWS Amplify with SSR compute (WEB_COMPUTE platform)
- **UI**: Shadcn components with Tailwind CSS
- **State Management**: Server actions with consistent `ActionState<T>` pattern

### Infrastructure Architecture (AWS CDK)
The infrastructure is organized into modular CDK stacks:

1. **AuthStack**: Cognito User Pool with Google OAuth federation
2. **DatabaseStack**: Aurora Serverless v2 with Data API enabled, RDS Proxy, automatic initialization
3. **FrontendStack**: Amplify app with GitHub integration, custom SSR compute role
4. **StorageStack**: S3 bucket for documents with lifecycle policies

### Server Actions Pattern
**CRITICAL**: All server actions MUST include comprehensive logging.
```typescript
"use server"
import { createLogger, generateRequestId, startTimer, sanitizeForLogging } from "@/lib/logger"
import { handleError, ErrorFactories, createSuccess } from "@/lib/error-utils"

export async function actionName(params: ParamsType): Promise<ActionState<ReturnType>> {
  // REQUIRED: Initialize logging context
  const requestId = generateRequestId()
  const timer = startTimer("actionName")
  const log = createLogger({ requestId, action: "actionName" })
  
  try {
    log.info("Action started", { params: sanitizeForLogging(params) })
    
    // 1. Authentication check
    const session = await getServerSession()
    if (!session) {
      log.warn("Unauthorized access attempt")
      throw ErrorFactories.authNoSession()
    }
    
    // 2. Authorization check (if needed)
    const hasAccess = await hasToolAccess(session.user.sub, "toolName")
    if (!hasAccess) {
      log.warn("Access denied", { userId: session.user.sub, tool: "toolName" })
      throw ErrorFactories.authzToolAccessDenied("toolName")
    }
    
    // 3. Business logic with logging
    log.debug("Processing operation", { detail: "value" })
    const result = await executeSQL(...)
    
    // REQUIRED: Log success and performance
    timer({ status: "success" })
    log.info("Action completed successfully")
    
    return createSuccess(result, "User-friendly success message")
  } catch (error) {
    // REQUIRED: Log error and performance
    timer({ status: "error" })
    return handleError(error, "User-friendly error message", {
      context: "actionName",
      requestId,
      operation: "actionName"
    })
  }
}
```

### Database Access Pattern
All database operations use RDS Data API via `executeSQL()`:
```typescript
// Simple query
const users = await executeSQL("SELECT * FROM users WHERE active = true")

// Parameterized query
const user = await executeSQL(
  "SELECT * FROM users WHERE id = :id",
  [{ name: "id", value: { longValue: userId } }]
)

// Transaction
await executeTransaction(async (transactionId) => {
  await executeSQL("INSERT INTO ...", params, transactionId)
  await executeSQL("UPDATE ...", params, transactionId)
})
```

Parameter types: `stringValue`, `longValue`, `booleanValue`, `doubleValue`, `isNull`

### Authentication Flow
1. User signs in via `/auth/signin` (Cognito hosted UI)
2. Cognito redirects back with authorization code
3. NextAuth exchanges code for tokens and creates JWT session
4. `getServerSession()` provides user info from JWT
5. Protected routes check session in middleware
6. Role-based access via `hasToolAccess()` function

### Error Handling and Logging Architecture

**MANDATORY**: All server-side code MUST implement proper logging and error handling.

#### Core Requirements
- **NO console.log/error**: Use logger from `@/lib/logger` exclusively
- **Request Tracing**: Every server action/API route must generate a requestId
- **Performance Tracking**: Use `startTimer()` for all operations
- **Sensitive Data Protection**: Always use `sanitizeForLogging()` for user input
- **Typed Errors**: Use ErrorFactories, never throw plain Error objects

#### Architecture Components
- **Server Actions**: Return `ActionState<T>` with consistent error structure
- **API Routes**: Use `withErrorHandling()` wrapper with proper logging
- **Client Components**: Use `useAction()` hook for automatic error handling
- **Structured Errors**: 60+ typed error codes with appropriate levels
- **Logging**: Winston logger with CloudWatch integration, automatic PII filtering
- **Error Levels**: INFO (validation), WARN (auth), ERROR (operations), FATAL (system)

### Project Structure
```
/
├── app/                    # Next.js App Router
│   ├── (auth)/            # Auth routes (signin, callback)
│   ├── (protected)/       # Protected feature routes
│   └── api/               # API routes
├── actions/               # Server actions (*.actions.ts)
├── components/            # Shared UI components
├── lib/                   # Utilities and core functions
│   ├── auth/             # Auth helpers
│   ├── db/               # Database adapter and queries
│   └── hooks/            # React hooks
├── types/                 # TypeScript type definitions
└── infra/                 # AWS CDK infrastructure
    ├── lib/              # CDK stack definitions
    └── database/         # DB schema and migrations
```

### Architectural Patterns
This codebase follows a **Layered Architecture** with Domain-Driven Design influences:

**Layer Separation:**
- **Presentation Layer**: `/app` (pages), `/components` (UI)
- **Application Layer**: `/actions` (server-side business logic) 
- **Infrastructure Layer**: `/lib` (adapters, utilities), `/infra` (AWS CDK)

**Key Principles:**
- Server-first approach with React Server Components
- Business logic isolated in server actions
- Infrastructure details abstracted behind adapters
- Consistent interfaces (`ActionState<T>`) between layers
- Direct SQL with parameterized queries (no ORM)

### Key Conventions
- **File Naming**: kebab-case (e.g., `user-role-form.tsx`)
- **Component Export**: File name matches component name
- **Database Tables**: Use `Table` suffix in schema definitions
- **Type Naming**: `InsertX` for inserts, `SelectX` for queries
- **Server Components**: Default in app directory
- **Client Components**: Explicit `"use client"` directive
- **Import Order**: React/Next → third-party → internal → styles
- **Database Field Transformation**: ALWAYS use `transformSnakeToCamel` from `@/lib/db/field-mapper` when converting database results from snake_case to camelCase. The data-api-adapter already does basic conversion, but for consistency use the standard transformer:
  ```typescript
  import { transformSnakeToCamel } from "@/lib/db/field-mapper"
  
  const transformed = results.map(row => transformSnakeToCamel<ExpectedType>(row))
  ```

### Environment Variables
Required environment variables are documented in `/docs/ENVIRONMENT_VARIABLES.md`. Key variables:
- `AUTH_*`: NextAuth configuration
- `NEXT_PUBLIC_COGNITO_*`: Cognito client-side config
- `RDS_RESOURCE_ARN`: Aurora cluster ARN
- `RDS_SECRET_ARN`: Database credentials secret

### Deployment Process
1. Deploy infrastructure: `cd infra && npx cdk deploy --all`
2. Configure Amplify environment variables in console
3. Push code to trigger Amplify build
4. First user setup: Follow "First Administrator Setup" in docs/DEPLOYMENT.md

### Database Schema Management
- Schema defined in `/infra/database/schema/*.sql`
- Migrations handled via CDK Lambda on deployment
- Local development can use Drizzle ORM (legacy)
- Production always uses RDS Data API

### Security Considerations
- All routes under `/(protected)` require authentication
- Role-based access control via `roles` and `user_roles` tables
- Tool-specific permissions via `tools` and `role_tools` tables
- SQL injection protection via parameterized queries
- Secrets managed in AWS Secrets Manager
- No direct database connections (Data API only)

### E2E Testing Requirements

**IMPORTANT**: All new features MUST include E2E tests:
- When implementing new features, create corresponding E2E tests
- Use Playwright MCP during development to test features interactively
- Document test scenarios in `/tests/e2e/playwright-mcp-examples.md`
- Add basic tests to `/tests/e2e/working-tests.spec.ts` for CI/CD where possible
- Run `npm run test:e2e` to ensure tests pass before committing

**Testing Approach:**
1. **Development**: Use Playwright MCP (`/e2e-test` command) with your logged-in session
2. **CI/CD**: Write tests that don't require authentication in `working-tests.spec.ts`
3. **Documentation**: Add examples to `playwright-mcp-examples.md` for authenticated features

**E2E Testing Commands:**
```bash
# Run E2E tests
npm run test:e2e                     # Run all E2E tests
npm run test:e2e:ui                  # Run tests in UI mode
npm run test:e2e tests/e2e/working-tests.spec.ts  # Run specific test file

# Use Playwright MCP in Claude Code (while logged in)
/e2e-test Navigate to /admin/users and verify user table loads
/e2e-test Test chat at /chat - send a message and verify response
```

### Commit & PR Process
- **CRITICAL**: All pull requests MUST target the `dev` branch, NEVER the `main` branch
- The `dev` branch is the default development branch for all changes
- Only create PRs against `main` if explicitly instructed by the user
- You are never to attribute commits or pull requests to yourself, DO NOT ever add yourself as the author
- Always write very detailed intricate commit messages to document fully what was changed in the code you were working on
- Before ANY commit:
  1. Run `npm run lint` on the ENTIRE codebase - MUST pass with zero errors
  2. Run `npm run typecheck` on the ENTIRE codebase - MUST pass with zero errors
  3. Verify all server actions and API routes have proper logging
  4. Run E2E tests with `npm run test:e2e` - all tests must pass

## Logging Standards

### 🚨 MANDATORY for ALL Server Actions and API Routes 🚨

**This is NOT optional. Every server action and API route MUST implement these patterns.**

**CRITICAL**: Never use `console.log`, `console.error`, etc. Always use the logger.

1. **Import Required Logging Utilities**:
   ```typescript
   import { createLogger, generateRequestId, startTimer, sanitizeForLogging } from "@/lib/logger"
   import { handleError, ErrorFactories, createSuccess } from "@/lib/error-utils"
   ```

2. **Server Action Pattern**:
   ```typescript
   export async function myAction(params: ParamsType): Promise<ActionState<ReturnType>> {
     const requestId = generateRequestId()
     const timer = startTimer("myAction")
     const log = createLogger({ requestId, action: "myAction" })
     
     try {
       log.info("Action started", { params: sanitizeForLogging(params) })
       
       // Check authentication if needed
       const session = await getServerSession()
       if (!session) {
         log.warn("Unauthorized access attempt")
         throw ErrorFactories.authNoSession()
       }
       
       // Your business logic here with appropriate logging
       log.debug("Processing operation", { detail: "value" })
       const result = await doSomething()
       
       // Log success and performance
       timer({ status: "success" })
       log.info("Action completed successfully")
       
       return createSuccess(result, "User-friendly success message")
       
     } catch (error) {
       timer({ status: "error" })
       return handleError(error, "User-friendly error message", {
         context: "myAction",
         requestId,
         operation: "myAction"
       })
     }
   }
   ```

3. **Use Error Factories Instead of Generic Errors**:
   ```typescript
   // ❌ BAD - Generic error
   throw new Error("DB error")
   
   // ✅ GOOD - Typed error with context
   throw ErrorFactories.dbQueryFailed(query, originalError)
   throw ErrorFactories.authzInsufficientPermissions("admin", userRoles)
   throw ErrorFactories.validationFailed(fieldErrors)
   ```

4. **Log Levels**:
   - `log.debug()` - Detailed information for debugging (not shown in production)
   - `log.info()` - Important business events (action started, completed, user created)
   - `log.warn()` - Warning conditions (auth failures, missing optional data)
   - `log.error()` - Error conditions (handled in error-utils.ts)

5. **Sensitive Data**:
   - Always use `sanitizeForLogging()` for user input
   - Email addresses are automatically masked to `***@domain.com`
   - Passwords, tokens, and API keys are automatically redacted

### Error Message Guidelines

**User-Facing Messages** (in ActionState):
- Be helpful and actionable
- Don't expose technical details
- Suggest next steps when possible

**Examples**:
```typescript
// ❌ BAD
return { isSuccess: false, message: "DB error" }
return { isSuccess: false, message: "Error occurred" }

// ✅ GOOD
return handleError(error, "Failed to load your repositories. Please try again or contact support if the issue persists.")
return handleError(error, "You don't have permission to delete this item. Contact the owner for access.")
```

**Technical Messages** (in logs):
- Include all relevant context
- Use structured metadata
- Include operation details

### Performance Tracking

Always use timers for operations:
```typescript
const timer = startTimer("operationName")
// ... do work ...
timer({ status: "success", recordCount: results.length })
```

### CloudWatch Integration

In production, logs are automatically formatted as JSON for CloudWatch:
```json
{
  "timestamp": "2025-01-05T10:00:00Z",
  "level": "error",
  "requestId": "abc123",
  "userId": "user-456",
  "action": "getUserDetails",
  "message": "Database query failed",
  "error": {
    "code": "DB_QUERY_FAILED",
    "query": "SELECT * FROM users WHERE id = :id",
    "details": { "id": 123 }
  },
  "duration": 1500
}
```

### API Route Pattern

**CRITICAL**: API routes MUST also implement full logging:

```typescript
import { NextRequest, NextResponse } from "next/server"
import { createLogger, generateRequestId, startTimer } from "@/lib/logger"
import { withErrorHandling } from "@/lib/error-utils"

export async function GET(request: NextRequest) {
  const requestId = generateRequestId()
  const timer = startTimer("GET /api/route-name")
  const log = createLogger({ requestId, route: "/api/route-name" })
  
  return withErrorHandling(async () => {
    log.info("API route called", { 
      method: "GET",
      url: request.url,
      headers: Object.fromEntries(request.headers)
    })
    
    // Your API logic here
    const result = await doSomething()
    
    timer({ status: "success" })
    log.info("API route completed")
    
    return NextResponse.json(result)
  })
}
```

### Database Operation Logging

When performing database operations, use the logging helpers:

```typescript
import { withDatabaseLogging } from "@/lib/logging-helpers"

const result = await withDatabaseLogging(
  "getUserById",
  { 
    query: "SELECT * FROM users WHERE id = :id",
    table: "users",
    parameters: [userId]
  },
  () => executeSQL(query, params)
)
```

### Common Logging Checklist

 Before implementing ANY server-side function:
- [ ] Import all required logging utilities
- [ ] Generate requestId at function start
- [ ] Create timer for performance tracking
- [ ] Initialize logger with context
- [ ] Log operation start with sanitized params
- [ ] Log all authentication/authorization failures
- [ ] Use ErrorFactories for all errors
- [ ] Call timer() before returning
- [ ] Use handleError() in catch blocks
- [ ] Never use console.log/error/warn
