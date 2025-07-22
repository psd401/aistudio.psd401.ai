# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build, Lint, Test Commands

```bash
# Development
npm run dev               # Start dev server on port 3000

# Build & Production
npm run build             # Build for production (Next.js)
npm run start             # Start production server

# Linting
npm run lint              # Run Next.js linting

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
All server actions follow this pattern:
```typescript
"use server"
export async function actionName(): Promise<ActionState<ReturnType>> {
  // 1. Authentication check
  const session = await getServerSession()
  if (!session) return { isSuccess: false, message: "Unauthorized" }
  
  // 2. Authorization check (if needed)
  const hasAccess = await hasToolAccess(session.user.sub, "toolName")
  if (!hasAccess) return { isSuccess: false, message: "Access denied" }
  
  // 3. Business logic with error handling
  try {
    const result = await executeSQL(...)
    return { isSuccess: true, message: "Success", data: result }
  } catch (error) {
    return handleError(error, "Operation failed")
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

### Error Handling Architecture
- **Server Actions**: Return `ActionState<T>` with consistent error structure
- **API Routes**: Use `withErrorHandling()` wrapper
- **Client Components**: Use `useAction()` hook for automatic error handling
- **Structured Errors**: `createError()` creates `AppError` with levels (USER, SYSTEM, EXTERNAL)
- **Logging**: Winston logger with CloudWatch integration

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

### Key Conventions
- **File Naming**: kebab-case (e.g., `user-role-form.tsx`)
- **Component Export**: File name matches component name
- **Database Tables**: Use `Table` suffix in schema definitions
- **Type Naming**: `InsertX` for inserts, `SelectX` for queries
- **Server Components**: Default in app directory
- **Client Components**: Explicit `"use client"` directive
- **Import Order**: React/Next → third-party → internal → styles

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