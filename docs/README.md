# AI Studio Documentation

Welcome to the AI Studio documentation. This guide provides comprehensive information for developers, operators, and administrators.

## 📚 Documentation Structure

### Core Documentation

#### [ARCHITECTURE.md](./ARCHITECTURE.md)
Complete system architecture including technology stack, design patterns, database schema, and security model.

#### [DEPLOYMENT.md](./DEPLOYMENT.md)
Step-by-step deployment guide for AWS infrastructure using CDK, including Google OAuth setup and first administrator configuration.

#### [ENVIRONMENT_VARIABLES.md](./ENVIRONMENT_VARIABLES.md)
Complete reference of all environment variables required for development and production environments.

### Development Guides

#### [guides/LOGGING.md](./guides/LOGGING.md)
Comprehensive logging patterns with examples for server actions, API routes, and error handling.

#### [guides/TESTING.md](./guides/TESTING.md)
Testing strategies including unit tests, integration tests, and E2E testing with Playwright.

#### [guides/TYPESCRIPT.md](./guides/TYPESCRIPT.md)
TypeScript best practices, conventions, and guidelines for maintaining type safety.

### API Documentation

#### [API/AI_SDK_PATTERNS.md](./API/AI_SDK_PATTERNS.md)
AI integration patterns using Vercel AI SDK v5, provider factory implementation, and streaming techniques.

### Feature Documentation

#### [features/navigation.md](./features/navigation.md)
Dynamic navigation system with role-based menu items.

#### [features/file-upload-architecture.md](./features/file-upload-architecture.md)
Document upload and processing system with S3 integration.

#### [features/EMBEDDING_SYSTEM.md](./features/EMBEDDING_SYSTEM.md)
Vector embedding and semantic search implementation.

#### AI Streaming Architecture
**Real-time AI streaming** via ECS Fargate with HTTP/2 support:

- **[features/ai-streaming-core-package.md](./features/ai-streaming-core-package.md)** - Shared package structure, provider adapters, and message processing
- **[features/polling-api-integration.md](./features/polling-api-integration.md)** - Client integration patterns and API endpoints
- **[operations/streaming-infrastructure.md](./operations/streaming-infrastructure.md)** - ECS infrastructure, monitoring, and operations
- **[guides/adding-ai-providers.md](./guides/adding-ai-providers.md)** - Step-by-step provider integration guide
- **[ASSISTANT_ARCHITECT_DEPLOYMENT.md](./ASSISTANT_ARCHITECT_DEPLOYMENT.md)** - Assistant Architect deployment and execution guide
- **[architecture/ADR-003-ecs-streaming-migration.md](./architecture/ADR-003-ecs-streaming-migration.md)** - Migration from Lambda to ECS (PR #340)

### Operations

#### [operations/OPERATIONS.md](./operations/OPERATIONS.md)
Operational procedures, monitoring, and maintenance guidelines.

## 🚀 Quick Start

### For New Developers
1. Start with [ARCHITECTURE.md](./ARCHITECTURE.md) to understand the system
2. Review [ARCHITECTURE.md#streaming-architecture-evolution](./ARCHITECTURE.md#streaming-architecture-evolution) for the streaming system
3. Review [ENVIRONMENT_VARIABLES.md](./ENVIRONMENT_VARIABLES.md) for setup
4. Follow [guides/TYPESCRIPT.md](./guides/TYPESCRIPT.md) for code standards
5. Reference [guides/LOGGING.md](./guides/LOGGING.md) for logging patterns

### For DevOps/Infrastructure
1. Follow [DEPLOYMENT.md](./DEPLOYMENT.md) for initial deployment
2. Study [operations/streaming-infrastructure.md](./operations/streaming-infrastructure.md) for ECS streaming operations
3. Review [operations/OPERATIONS.md](./operations/OPERATIONS.md) for maintenance
4. Check [ARCHITECTURE.md](./ARCHITECTURE.md#infrastructure) for infrastructure details

### For Testing
1. Read [guides/TESTING.md](./guides/TESTING.md) for testing strategies
2. Use Playwright MCP for E2E testing during development
3. Add tests to `working-tests.spec.ts` for CI/CD

## 📖 Key Concepts

### ActionState Pattern
All server actions return a consistent response structure. See [ARCHITECTURE.md#actionstate-pattern](./ARCHITECTURE.md#actionstate-pattern).

### Provider Factory
Unified interface for multiple AI providers. See [API/AI_SDK_PATTERNS.md](./API/AI_SDK_PATTERNS.md#provider-factory-pattern).

### Request Tracing
Every operation gets a unique request ID for end-to-end tracing. See [guides/LOGGING.md](./guides/LOGGING.md#request-tracing).

### Settings Management
Database-first configuration with environment fallback. See [ARCHITECTURE.md#settings-management](./ARCHITECTURE.md#settings-management).

### ECS Streaming Architecture
Direct ECS execution for real-time AI streaming with HTTP/2 support. See [ARCHITECTURE.md#streaming-architecture-evolution](./ARCHITECTURE.md#streaming-architecture-evolution).

### AI Streaming Core Package
Shared provider abstraction for consistent AI integration. See [features/ai-streaming-core-package.md](./features/ai-streaming-core-package.md).

## 🔧 Common Tasks

### Adding a New Feature
1. Design the database schema
2. Create server actions with proper logging
3. Build UI components
4. Add E2E tests
5. Update documentation

### Adding a New AI Provider
1. Follow [guides/adding-ai-providers.md](./guides/adding-ai-providers.md)
2. Create provider adapter in AI SDK provider factory
3. Add to database models and configuration
4. Test with real API and update monitoring
5. Deploy and verify in staging environment

### Debugging Production Issues
1. Use request ID to trace through CloudWatch logs
2. Check error codes in application logs
3. Review [operations/OPERATIONS.md](./operations/OPERATIONS.md) for procedures

### Deploying Updates
1. Test locally with `npm run dev`
2. Run `npm run lint` and `npm run typecheck`
3. Deploy with CDK: `npx cdk deploy`
4. Monitor CloudWatch for errors

### Deploying Background Lambdas
For Lambda functions used for background processing (document processing, embeddings):
1. Build and package Lambda functions in `/infra/lambdas/`
2. Deploy via CDK: `npx cdk deploy AIStudio-ProcessingStack-Dev`
3. Verify function logs in CloudWatch
4. Note: AI streaming is handled by ECS, not Lambda

## 📁 Archive

Historical documentation for reference:

- **[archive/implementations/](./archive/implementations/)** - Completed feature implementations and bug fixes
- **[archive/planning/](./archive/planning/)** - Completed project plans and proposals
- **[archive/](./archive/)** - Other archived documentation

## 🔗 External Resources

- [Next.js Documentation](https://nextjs.org/docs)
- [AWS CDK Guide](https://docs.aws.amazon.com/cdk/latest/guide/)
- [Vercel AI SDK](https://sdk.vercel.ai/docs)
- [Playwright Documentation](https://playwright.dev)

## 📝 Documentation Standards

### When to Update Documentation
- **Always** when adding new features
- **Always** when changing architecture
- **Always** when modifying deployment process
- When fixing complex bugs (document the solution)
- When discovering non-obvious patterns

### Documentation Guidelines
1. Keep documentation close to code
2. Use clear, concise language
3. Include code examples
4. Update the table of contents
5. Archive outdated documentation

### File Organization
- Current, active documentation stays in main folders
- Completed implementations move to `archive/implementations/`
- Completed plans move to `archive/planning/`
- Outdated versions move to `archive/` with descriptive names

## 🤝 Contributing

When contributing to documentation:
1. Follow the existing structure
2. Use proper markdown formatting
3. Include practical examples
4. Cross-reference related documents
5. Update this README index

## 🏗️ Architecture Decision Records

Key architectural decisions documented:

- **[ADR-001: Authentication Optimization](./architecture/ADR-001-authentication-optimization.md)** - NextAuth v5 with Cognito integration
- **[ADR-002: Streaming Architecture Migration](./architecture/ADR-002-streaming-architecture-migration.md)** - Amplify to ECS Fargate migration
- **[ADR-003: ECS Streaming Migration](./architecture/ADR-003-ecs-streaming-migration.md)** - Lambda workers to direct ECS execution

---

*Last updated: October 2025*
*For AI assistant guidelines, see [CLAUDE.md](../CLAUDE.md)*