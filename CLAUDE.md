# CLAUDE.md

AI Studio codebase guidance for Claude Code. Optimized for token efficiency and accuracy.

## 🚀 Quick Reference

```bash
# Development
npm run dev                # Start dev server (port 3000)
npm run build              # Build for production
npm run lint               # MUST pass before commit
npm run typecheck          # MUST pass before commit
npm run test:e2e           # Run E2E tests

# Infrastructure (from /infra)
cd infra && npx cdk deploy --all                          # Deploy all stacks
cd infra && npx cdk deploy AIStudio-FrontendStack-Dev     # Deploy single stack
```

## 🎯 Critical Rules

1. **Type Safety**: NO `any` types. Full TypeScript. Run `npm run lint` and `npm run typecheck` on ENTIRE codebase before commits.
2. **Database Migrations**: Files 001-005 are IMMUTABLE. Only add migrations 010+. Add filename to `MIGRATION_FILES` array in `/infra/database/lambda/db-init-handler.ts`.
3. **Logging**: NEVER use `console.log/error`. Always use `@/lib/logger`. See patterns below.
4. **Git Flow**: PRs target `dev` branch, never `main`. Write detailed commit messages.
5. **Testing**: Add E2E tests for new features. Use Playwright MCP during development.

## 🏗️ Architecture

**Stack**: Next.js 15 App Router • AWS Amplify SSR • Aurora Serverless v2 • Cognito Auth

**Core Patterns**:
- Server Actions return `ActionState<T>` 
- RDS Data API for all DB operations
- JWT sessions via NextAuth v5
- Layered architecture (presentation → application → infrastructure)

**File Structure**:
```
/app         → Pages & API routes
/actions     → Server actions (*.actions.ts)
/components  → UI components
/lib         → Core utilities & adapters
/infra       → AWS CDK infrastructure
```

## 🤖 AI Integration

**AI SDK v5** with provider factory pattern:
- Providers: OpenAI (GPT-5/4), Google (Gemini), Amazon Bedrock (Claude), Azure
- Streaming: `streamText` for chat, SSE for assistant architect
- Client: `@ai-sdk/react` v2 with `useChat` hook

**Provider Factory** (`/app/api/chat/lib/provider-factory.ts`):
```typescript
createProviderModel(provider: string, modelId: string): Promise<LanguageModel>
```

**Settings Management**:
- Database-first with env fallback via `@/lib/settings-manager`
- Cache with 5-minute TTL
- AWS Lambda IAM role support for Bedrock

## 📚 Document Processing

**Supported**: PDF, DOCX, TXT (via `/lib/document-processing.ts`)
**Storage**: S3 with presigned URLs for large files
**Limits**: 10MB default, configurable per deployment

## 🗄️ Database Operations

**Always use MCP tools to verify structure**:
```bash
mcp__awslabs_postgres-mcp-server__get_table_schema
mcp__awslabs_postgres-mcp-server__run_query
```

**Data API Parameters**:
- `stringValue`, `longValue`, `booleanValue`, `doubleValue`, `isNull`

**Field Transformation** (DB returns snake_case, app uses camelCase):
```typescript
import { transformSnakeToCamel } from "@/lib/db/field-mapper"

// Database returns: { user_id: 1, created_at: "2025-01-01" }
// App expects: { userId: 1, createdAt: "2025-01-01" }
const results = await executeSQL("SELECT user_id, created_at FROM users")
const transformed = results.map(row => transformSnakeToCamel<UserType>(row))
```

## 📝 Server Action Template

```typescript
"use server"
import { createLogger, generateRequestId, startTimer, sanitizeForLogging } from "@/lib/logger"
import { handleError, ErrorFactories, createSuccess } from "@/lib/error-utils"
import { getServerSession } from "@/lib/auth/server-session"

export async function actionName(params: ParamsType): Promise<ActionState<ReturnType>> {
  const requestId = generateRequestId()
  const timer = startTimer("actionName")
  const log = createLogger({ requestId, action: "actionName" })
  
  try {
    log.info("Action started", { params: sanitizeForLogging(params) })
    
    // Auth check
    const session = await getServerSession()
    if (!session) {
      log.warn("Unauthorized")
      throw ErrorFactories.authNoSession()
    }
    
    // Business logic
    const result = await executeSQL("SELECT * FROM ...", params)
    
    timer({ status: "success" })
    log.info("Action completed")
    return createSuccess(result, "Success message")
    
  } catch (error) {
    timer({ status: "error" })
    return handleError(error, "User-friendly error", {
      context: "actionName",
      requestId,
      operation: "actionName"
    })
  }
}
```

## 🧪 Testing

**E2E Testing**:
- Development: Use Playwright MCP (`/e2e-test` command)
- CI/CD: Add to `/tests/e2e/working-tests.spec.ts`
- Documentation: Update `/tests/e2e/playwright-mcp-examples.md`

## 🔒 Security

- Routes under `/(protected)` require authentication
- Role-based access via `hasToolAccess("tool-name")` - checks if user has permission
- Parameterized queries prevent SQL injection
- Secrets in AWS Secrets Manager
- `sanitizeForLogging()` for PII protection

## 📦 Key Dependencies

- `ai@5.0.0` - Vercel AI SDK core
- `@ai-sdk/react@2.0.15` - React streaming hooks
- `@ai-sdk/*` - Provider adapters (OpenAI, Google, Bedrock, Azure)
- `next@15.2.3` - Next.js framework
- `next-auth@5.0.0-beta.29` - Authentication
- AWS SDK v3 clients for cloud services

## 🚨 Common Pitfalls

- **Don't** modify files 001-005 in `/infra/database/schema/`
- **Don't** use console methods - ESLint will catch this
- **Don't** create PRs against `main` - use `dev`
- **Don't** skip type checking - entire codebase must pass
- **Don't** trust app code for DB schema - use MCP tools
- **Don't** commit without running lint and typecheck

## 📖 Documentation

**Structure:**
```
/docs/
├── README.md           # Documentation index
├── ARCHITECTURE.md     # System architecture
├── DEPLOYMENT.md       # Deployment guide
├── guides/            # Development guides
├── features/          # Feature docs
├── operations/        # Ops & monitoring
└── archive/           # Historical docs
```

**Maintenance:**
- Keep docs current with code changes
- Archive completed implementations
- Remove outdated content
- Update index when adding docs

## 🎯 Repository Knowledge System

**Assistant Architect**: Processes repository context for AI assistants
**Embeddings**: Vector search via `/lib/repositories/search-service.ts`
**Knowledge Base**: Stored in S3, retrieved during execution

---
*Token-optimized for Claude Code efficiency. Last updated: August 2025*