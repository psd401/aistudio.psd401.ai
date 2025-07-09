# AIStudio Technical Specification

## Overview
AIStudio is a Next.js 14+ enterprise application that implements role-based access control (RBAC) using AWS Cognito with NextAuth v5 for authentication and AWS RDS Aurora Serverless v2 (PostgreSQL) for data persistence. The application follows modern development practices and implements AWS Well-Architected Framework principles for enterprise-grade applications.

## Core Architecture

### Technology Stack
- **Frontend:** Next.js 14+ with App Router, React Server Components
- **Authentication:** AWS Cognito + NextAuth v5 + Google OAuth
- **Database:** AWS RDS Aurora Serverless v2 (PostgreSQL) with RDS Data API
- **UI Framework:** Shadcn UI + Tailwind CSS
- **Infrastructure:** AWS CDK (TypeScript)
- **Hosting:** AWS Amplify (WEB_COMPUTE platform with SSR)
- **Storage:** AWS S3 (private, encrypted, versioned)
- **State Management:** React hooks + Server Actions

### Infrastructure as Code
All AWS resources are provisioned using AWS CDK:
- Isolated VPC with public/private subnets
- Aurora Serverless v2 with automatic scaling
- Cognito User Pool with Google IdP integration
- S3 bucket with lifecycle policies
- IAM roles with least-privilege access
- Cost allocation tags for billing

## Authentication & Authorization

### Authentication (AWS Cognito + NextAuth v5)
- User authentication handled by AWS Cognito with NextAuth v5 adapter
- Google OAuth integration for federated login
- Protected routes verify authentication using `getServerSession()` from `/lib/auth/server-session.ts`
- Unauthenticated users are redirected to sign-in page
- Session management with JWT tokens
- Automatic user creation on first sign-in

### Role-Based Access Control
- **Roles:** Admin, Staff (default)
- **Tools:** Various feature-specific permissions
- Role hierarchy:
  - Admin: Full access to all features and tools
  - Staff: Access to assigned tools only
- Permission checks using `hasToolAccess()` from `/lib/db/data-api-adapter.ts`
- Role and tool assignments managed through admin interface

## Database Architecture

### Core Tables

#### Users Table
```sql
Table users {
  id         serial    primary key
  cognitoId  text      unique not null
  email      text      not null
  name       text
  role       text      not null default 'Staff'
  createdAt  timestamp default now()
  updatedAt  timestamp default now()
}
```

#### User Tools Table
```sql
Table user_tools {
  id        serial    primary key
  userId    integer   references users(id)
  toolId    integer   references tools(id)
  createdAt timestamp default now()
}
```

#### Tools Table
```sql
Table tools {
  id          serial    primary key
  name        text      unique not null
  description text
  route       text      not null
  createdAt   timestamp default now()
}
```

### Database Operations
- **New Features:** Use RDS Data API via `executeSQL()` from `/lib/db/data-api-adapter.ts`
- **Legacy Code:** May still use Drizzle ORM (gradually migrating)
- Parameterized queries with proper type mapping:
  - `stringValue` for text
  - `longValue` for integers
  - `booleanValue` for booleans
  - `isNull: true` for null values
- Transaction support for multi-step operations
- Connection validation with `validateDataAPIConnection()`

## Code Organization

```
app/
├── (auth)/           # Authentication pages
├── (protected)/      # Protected routes requiring auth
│   ├── admin/        # Admin panel
│   ├── chat/         # AI chat interface
│   ├── dashboard/    # User dashboard
│   ├── ideas/        # Ideas management
│   └── utilities/    # Various AI utilities
├── api/              # API routes
│   ├── auth/         # Auth endpoints
│   ├── chat/         # Chat API
│   └── navigation/   # Navigation data
├── actions/          # Server actions
└── components/       # Shared components

components/
├── ui/               # Shadcn UI components
├── auth/             # Auth-related components
└── features/         # Feature-specific components

actions/
├── auth.ts           # Authentication actions
└── db/               # Database actions by domain

lib/
├── auth/             # Auth utilities
├── db/               # Database utilities
├── ai/               # AI/LLM integrations
└── utils/            # General utilities

infra/
├── lib/              # CDK stack definitions
└── bin/              # CDK app entry point
```

## Error Handling

### Structured Error Handling
- Use `createError()` from `/lib/error-utils.ts` for creating errors
- Use `handleError()` for consistent error handling in server actions
- Server actions return `ActionState<T>` type:
  ```typescript
  type ActionState<T> = {
    isSuccess: boolean;
    message: string;
    data?: T;
    errors?: Array<{ path: string; message: string }>;
    timestamp?: number;
  }
  ```
- API routes use `withErrorHandling()` wrapper
- Client components use `useAction()` hook for error handling

## Environment Variables

### Critical Variables
- `AUTH_URL`: Full deployment URL
- `AUTH_SECRET`: NextAuth session secret
- `AUTH_COGNITO_CLIENT_ID`: Cognito client ID
- `AUTH_COGNITO_ISSUER`: Cognito issuer URL
- `NEXT_PUBLIC_AWS_REGION`: AWS region
- `RDS_RESOURCE_ARN`: RDS cluster ARN
- `RDS_SECRET_ARN`: Database credentials secret

### AWS Runtime Configuration
- AWS Amplify provides `AWS_REGION` automatically
- SSR Compute role provides AWS credentials at runtime
- No AWS_ prefixed variables in Amplify console

## Security Considerations

### Authentication Security
- JWT tokens with secure HTTP-only cookies
- CSRF protection via NextAuth
- Secure session management
- OAuth state validation

### Database Security
- Parameterized queries prevent SQL injection
- Secrets managed by AWS Secrets Manager
- IAM-based database authentication
- VPC isolation for database

### Application Security
- Server-side authorization checks
- Input validation and sanitization
- XSS protection via React
- Content Security Policy headers

## Development Guidelines

### Code Style
- TypeScript with strict mode
- ESLint + Prettier for formatting
- Conventional commits
- Comprehensive JSDoc comments

### Testing Strategy
- Unit tests with Jest + React Testing Library
- Integration tests for API endpoints
- Database migration testing
- E2E tests for critical flows

### Performance Optimization
- React Server Components by default
- Client components only when necessary
- Image optimization with Next.js Image
- Database connection pooling via RDS Proxy
- CDN caching with Amplify

## Deployment Process

### Development Workflow
1. Local development with `.env.local`
2. Feature branches with PR reviews
3. Automated testing in CI/CD
4. Deploy to dev environment
5. Manual testing and approval
6. Deploy to production

### Infrastructure Deployment
1. CDK synth and diff
2. Manual approval for production
3. Rolling deployments
4. Database migrations with backups
5. Environment variable updates
6. Health checks and monitoring

## Monitoring & Operations

### Application Monitoring
- CloudWatch Logs for application logs
- CloudWatch Metrics for performance
- Error tracking and alerting
- User analytics

### Infrastructure Monitoring
- AWS Cost Explorer with tags
- RDS Performance Insights
- Amplify deployment metrics
- S3 access logs

### Operational Procedures
- Backup and restore procedures
- Incident response playbooks
- Scaling guidelines
- Security updates process

## Future Enhancements

### Planned Features
- Multi-factor authentication
- Advanced AI model selection
- Real-time collaboration
- Mobile application
- API rate limiting
- Audit logging

### Technical Debt
- Complete migration from Drizzle to RDS Data API
- Implement comprehensive E2E tests
- Add request tracing
- Optimize bundle size
- Implement caching strategy