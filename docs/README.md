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

### Operations

#### [operations/OPERATIONS.md](./operations/OPERATIONS.md)
Operational procedures, monitoring, and maintenance guidelines.

## 🚀 Quick Start

### For New Developers
1. Start with [ARCHITECTURE.md](./ARCHITECTURE.md) to understand the system
2. Review [ENVIRONMENT_VARIABLES.md](./ENVIRONMENT_VARIABLES.md) for setup
3. Follow [guides/TYPESCRIPT.md](./guides/TYPESCRIPT.md) for code standards
4. Reference [guides/LOGGING.md](./guides/LOGGING.md) for logging patterns

### For DevOps/Infrastructure
1. Follow [DEPLOYMENT.md](./DEPLOYMENT.md) for initial deployment
2. Review [operations/OPERATIONS.md](./operations/OPERATIONS.md) for maintenance
3. Check [ARCHITECTURE.md](./ARCHITECTURE.md#infrastructure) for infrastructure details

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

## 🔧 Common Tasks

### Adding a New Feature
1. Design the database schema
2. Create server actions with proper logging
3. Build UI components
4. Add E2E tests
5. Update documentation

### Debugging Production Issues
1. Use request ID to trace through CloudWatch logs
2. Check error codes in application logs
3. Review [operations/OPERATIONS.md](./operations/OPERATIONS.md) for procedures

### Deploying Updates
1. Test locally with `npm run dev`
2. Run `npm run lint` and `npm run typecheck`
3. Deploy with CDK: `npx cdk deploy`
4. Monitor CloudWatch for errors

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

---

*Last updated: August 2025*
*For AI assistant guidelines, see [CLAUDE.md](../CLAUDE.md)*