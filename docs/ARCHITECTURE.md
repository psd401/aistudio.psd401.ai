# AI Studio Architecture

## Overview

AI Studio is a Next.js 15+ enterprise application built with modern cloud-native architecture principles. It provides AI-powered tools with role-based access control, featuring multiple LLM providers, document processing, and knowledge management capabilities.

## Technology Stack

### Core Framework
- **Frontend**: Next.js 15+ with App Router, React 19
- **UI Components**: Shadcn UI + Tailwind CSS
- **TypeScript**: Strict type safety across the application

### AI & Machine Learning
- **AI SDK**: Vercel AI SDK v5 for LLM integration
- **Providers**: 
  - OpenAI (GPT-5, GPT-4, GPT-3.5)
  - Google AI (Gemini models)
  - Amazon Bedrock (Claude, Llama)
  - Azure OpenAI
- **Streaming**: Server-Sent Events (SSE) for real-time responses
- **Embeddings**: Vector search for knowledge retrieval

### Authentication & Security
- **Auth Provider**: AWS Cognito with Google OAuth federation
- **Session Management**: NextAuth v5 with JWT strategy
- **RBAC**: Role-based access control with tool-specific permissions
- **Security Headers**: CSRF protection, CSP, secure cookies

### Data Layer
- **Database**: AWS Aurora Serverless v2 (PostgreSQL)
- **Access Pattern**: RDS Data API (no direct connections)
- **ORM**: Direct SQL with parameterized queries
- **Caching**: 5-minute TTL for settings

### Infrastructure
- **IaC**: AWS CDK (TypeScript)
- **Hosting**: AWS Amplify with SSR compute (WEB_COMPUTE)
- **Storage**: S3 with lifecycle policies
- **Monitoring**: CloudWatch with structured logging
- **Network**: VPC with public/private subnets

## System Architecture

```
┌─────────────────┐     ┌──────────────┐     ┌─────────────────┐
│                 │     │              │     │                 │
│  Client (React) │────▶│   Next.js    │────▶│   AWS Cognito   │
│                 │     │  App Router  │     │    + Google     │
└─────────────────┘     └──────────────┘     └─────────────────┘
                               │
                               ▼
                    ┌──────────────────┐
                    │                  │
                    │  Server Actions  │
                    │   & API Routes   │
                    │                  │
                    └──────────────────┘
                               │
                ┌──────────────┴──────────────┐
                ▼                             ▼
        ┌──────────────┐            ┌──────────────┐
        │              │            │              │
        │  AI Providers│            │   RDS Data   │
        │   (Factory)  │            │     API      │
        │              │            │              │
        └──────────────┘            └──────────────┘
                │                             │
                ▼                             ▼
    ┌───────────────────────┐      ┌──────────────┐
    │ OpenAI/Google/Bedrock │      │Aurora Server-│
    │      Azure APIs       │      │   less v2    │
    └───────────────────────┘      └──────────────┘
```

## Layered Architecture

### Presentation Layer (`/app`, `/components`)
- React Server Components (default)
- Client components with `"use client"` directive
- Shadcn UI components with Tailwind CSS
- Form handling with react-hook-form

### Application Layer (`/actions`)
- Server actions return `ActionState<T>` pattern
- Business logic isolation
- Request ID tracking for tracing
- Comprehensive logging and error handling

### Infrastructure Layer (`/lib`)
- Database adapter (`/lib/db`)
- Authentication utilities (`/lib/auth`)
- AI provider factory (`/app/api/chat/lib`)
- AWS service clients (S3, CloudWatch)
- Settings management with caching

## Key Design Patterns

### 1. ActionState Pattern
All server actions return a consistent response structure:
```typescript
interface ActionState<T> {
  isSuccess: boolean
  data?: T
  error?: {
    code: string
    message: string
    details?: unknown
  }
  message?: string
}
```

### 2. Provider Factory Pattern
Unified interface for multiple AI providers:
```typescript
createProviderModel(provider: string, modelId: string): Promise<LanguageModel>
```

### 3. Request Tracing
Every operation gets a unique request ID:
```typescript
const requestId = generateRequestId()
const log = createLogger({ requestId, action: "actionName" })
```

### 4. Settings Management
Database-first configuration with environment fallback:
```typescript
// Check database → Fall back to env → Cache result
await getSetting('OPENAI_API_KEY')
```

## Database Schema

### Core Tables

#### Users & Roles
- `users` - User accounts linked to Cognito
- `roles` - Available roles (Admin, Staff)
- `user_roles` - User-role associations
- `tools` - Feature-specific permissions
- `role_tools` - Role-tool associations

#### AI & Chat
- `models` - AI model configurations
- `conversations` - Chat sessions
- `messages` - Chat messages with usage tracking
- `token_usage` - Token consumption tracking

#### Knowledge Management
- `repositories` - GitHub repository metadata
- `repository_files` - Indexed file content
- `documents` - Uploaded documents
- `embeddings` - Vector embeddings for search

#### Assistant Architect
- `assistant_architects` - AI assistant configurations
- `assistant_tools` - Tool assignments
- `assistant_executions` - Execution history

## Security Architecture

### Authentication Flow
1. User initiates sign-in via `/auth/signin`
2. Redirected to Cognito hosted UI
3. Google OAuth authentication
4. Cognito returns authorization code
5. NextAuth exchanges for JWT tokens
6. Session stored in HTTP-only cookies

### Authorization Model
- **Role Hierarchy**: Admin → Staff
- **Tool-Based Permissions**: Granular feature access
- **Session Validation**: Server-side JWT verification
- **CSRF Protection**: State parameter validation

### Data Protection
- **SQL Injection**: Parameterized queries only
- **XSS Prevention**: Input sanitization, CSP headers
- **Secrets Management**: AWS Secrets Manager
- **PII Handling**: Automatic log redaction

## Performance Optimizations

### Caching Strategy
- **Settings**: 5-minute TTL cache
- **Model Configs**: In-memory caching
- **S3 Client**: Connection pooling
- **Database**: RDS Proxy for connection management

### Streaming Architecture
- **Chat Responses**: SSE for real-time streaming
- **File Processing**: Chunked uploads for large files
- **Assistant Execution**: Progressive updates

### Code Splitting
- **Route-based**: Automatic with App Router
- **Component-level**: Dynamic imports for heavy components
- **Library-level**: Lazy loading for document processors

## Monitoring & Observability

### Structured Logging
- JSON format in production
- Request ID correlation
- Performance metrics
- User context injection

### CloudWatch Integration
```json
{
  "timestamp": "2025-08-20T10:00:00Z",
  "level": "info",
  "requestId": "abc123",
  "userId": "user-456",
  "action": "chat.completion",
  "duration": 1234,
  "tokens": 500
}
```

### Error Tracking
- Typed error codes (60+ categories)
- Appropriate severity levels
- Stack traces in development
- User-friendly messages in production

## Deployment Architecture

### Infrastructure as Code
All resources defined in AWS CDK:
```
/infra/
├── lib/
│   ├── auth-stack.ts       # Cognito configuration
│   ├── database-stack.ts   # Aurora Serverless
│   ├── frontend-stack.ts   # Amplify hosting
│   └── storage-stack.ts    # S3 buckets
└── database/
    └── schema/              # SQL migrations
```

### Environment Strategy
- **Development**: Feature branches, rapid iteration
- **Staging**: Integration testing, QA
- **Production**: Blue-green deployments

### Database Migrations
1. Files 001-005: Initial schema (immutable)
2. Files 010+: Incremental migrations
3. Lambda-based automatic execution
4. Transaction-wrapped for consistency

## Future Enhancements

### In Progress
- Multi-modal support (images, audio)
- Advanced streaming with partial tool calls
- Model Context Protocol (MCP) integration

### Planned
- WebSocket support for real-time collaboration
- Edge runtime optimization
- Distributed caching with Redis
- Horizontal scaling with container orchestration

## Development Guidelines

### Code Organization
```
/app         → Pages and API routes
/actions     → Server-side business logic
/components  → Reusable UI components
/lib         → Shared utilities and adapters
/types       → TypeScript definitions
/infra       → AWS CDK infrastructure
```

### Naming Conventions
- **Files**: kebab-case (`user-actions.ts`)
- **Components**: PascalCase matching filename
- **Server Actions**: camelCase with `Action` suffix
- **Database**: snake_case for tables/columns

### Quality Standards
- Zero TypeScript errors (`npm run typecheck`)
- Zero ESLint violations (`npm run lint`)
- Comprehensive logging (no console methods)
- E2E tests for new features
- 80% code coverage minimum

## References

- [Next.js Documentation](https://nextjs.org/docs)
- [AWS CDK Guide](https://docs.aws.amazon.com/cdk/latest/guide/)
- [Vercel AI SDK](https://sdk.vercel.ai/docs)
- [Internal CLAUDE.md](../CLAUDE.md) - AI assistant guidelines