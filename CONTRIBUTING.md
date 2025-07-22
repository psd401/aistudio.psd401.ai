# Contributing Guidelines

Thank you for contributing to this project! Please follow these standards to ensure code quality, maintainability, and security.

## Logging
- **Do NOT use** `console.log`, `console.error`, `console.warn`, `console.info`, or `console.debug` in any production or shared code.
- **All logging must use** the Winston logger (`import logger from "@/lib/logger"`) **in server-side code only** (server actions, API routes, backend utilities).
- **Never import or use `@/lib/logger` in client components or client hooks.** This will break the build.
- In client components/hooks, use `console.error` only for actionable errors in development. Do not log routine or non-actionable information.
- Remove any logs that are not valuable for debugging or operational insight.
- Never add logs for routine permission checks, database queries, or other noise.

## Linting & Formatting
- All code must pass ESLint (`npm run lint`).
- The `no-console` rule is enforced: no direct `console.*` calls are allowed in production/shared code. Client code may use `console.error` for actionable errors in development only.
- Use Prettier or the project's formatting rules for code style.
- Run `npm run typecheck` to ensure TypeScript types are correct before committing.

## TypeScript & Types
- Use TypeScript for all code.
- Prefer **interfaces** over type aliases.
- Export all types from `types/index.ts`.
- Import types from `@/types`.
- If referring to DB types, use `@/db/schema`.
- Use proper type imports: `import type { ... }` for type-only imports.

## Environment Variables
- Never expose secrets or sensitive values to the frontend.
- Use the `NEXT_PUBLIC_` prefix only for variables that must be accessed in the frontend.
- Update `.env.example` when adding or changing environment variables.
- Store all secrets in `.env.local` (never commit this file).
- **DB_LOG_QUERIES**: Set to `true` in `.env.local` to enable Drizzle ORM query logging in development. Leave blank or set to `false` to disable noisy query logs and keep dev logs clean.
- **Required for SSR**: Set `AMPLIFY_APP_ORIGIN=https://yourdomain.com` for server-side auth flows (use HTTPS in production).

## Security Best Practices

### Authentication & Authorization
- **JWT Configuration**: When using NextAuth, explicitly set `session: { strategy: "jwt" }` in configuration.
- **Session Security**: Always configure NextAuth with appropriate callbacks for JWT and session management.
- **Role-Based Access**: Use the `hasToolAccess()` function to check permissions before allowing access to protected resources.
- **Middleware Protection**: Implement authentication checks in `middleware.ts` for protected routes.

### AWS Infrastructure (CDK)
- **Security Groups**: Apply least-privilege principles. Never allow 0.0.0.0/0 unless absolutely necessary.
- **Encryption**: Enable encryption at rest for all data stores (RDS, S3, etc.).
- **SSL/TLS**: Enforce SSL on S3 buckets and use minimum TLS version 1.2.
- **IAM Policies**: Follow least-privilege principles. Use the CDK's `ConfirmPermissionsBroadening` check.
- **Secrets Management**: Use AWS Secrets Manager for all sensitive configuration. Never hardcode secrets.

### Database Access
- **Parameterized Queries**: Always use parameterized queries with the RDS Data API:
  ```typescript
  await executeSQL(
    "SELECT * FROM users WHERE id = :id",
    [{ name: "id", value: { longValue: userId } }]
  )
  ```
- **Transaction Management**: Use `executeTransaction()` for operations that modify multiple tables.
- **Connection Security**: Access the database only through RDS Data API, never direct connections.

## Server-Side Rendering (SSR) & Next.js

### Amplify Configuration
- Always configure Amplify with `ssr: true` in Next.js applications:
  ```typescript
  Amplify.configure(config, { ssr: true })
  ```
- Use `runWithAmplifyServerContext` for all server-side Amplify operations.
- Import server-side APIs from the `/server` sub-path (e.g., `aws-amplify/auth/server`).

### Performance Optimization
- **Development**: Use `npm run dev --turbo` for faster local development with Turbopack.
- **Imports**: Import specific components rather than entire libraries:
  ```typescript
  // Good
  import TriangleIcon from '@phosphor-icons/react/dist/csr/Triangle'
  // Bad
  import { TriangleIcon } from '@phosphor-icons/react'
  ```
- **Images**: Use `next/image` with proper `width` and `height` or `fill` props.

## Code Patterns & Architecture

### Server Actions
Follow the consistent `ActionState<T>` pattern for all server actions:
```typescript
export async function actionName(): Promise<ActionState<ReturnType>> {
  const session = await getServerSession()
  if (!session) return { isSuccess: false, message: "Unauthorized" }
  
  try {
    const result = await executeSQL(...)
    return { isSuccess: true, message: "Success", data: result }
  } catch (error) {
    return handleError(error, "Operation failed")
  }
}
```

### Error Handling
- Use structured error handling with `AppError` and error levels (USER, SYSTEM, EXTERNAL).
- Handle refresh token errors gracefully in authentication flows.
- Provide meaningful error messages that help users understand what went wrong.

### File References
When documenting code or in comments, include file references in the format `path/to/file.ts:lineNumber` for easy navigation.

## Naming & Imports
- Use **kebab-case** for all files and folders.
- Use the `@` alias for imports unless otherwise specified.
- Follow existing naming patterns in the codebase.

## Components & Folders
- Place shared components in `/components`.
- Place one-off route components in `/_components` within the route.
- Follow project structure and naming conventions.
- Keep components focused and single-purpose.

## Testing
- Add or update tests for new features and bug fixes.
- Include tests for authentication flows and protected routes.
- Test error scenarios and edge cases.
- Do not break existing tests.
- Run all tests before submitting a PR (`npm test`).

## Development Workflow

### Before Committing
1. Run `npm run lint` to check for linting errors.
2. Run `npm run typecheck` to verify TypeScript types.
3. Run `npm test` to ensure all tests pass.
4. Update `CLAUDE.md` if you've made architectural changes.
5. Update relevant documentation for API changes.

### Pull Requests & Code Review
- All PRs must pass CI (lint, build, and tests) before merge.
- All PRs must be reviewed and approved by at least one other contributor.
- Use the PR template and complete all checklist items.
- Include clear descriptions of what changed and why.
- Reference any related issues or tickets.

## Documentation
- Update documentation as needed for new features, changes, or fixes.
- Document security implications of changes.
- Keep `CLAUDE.md` up to date with architectural decisions.
- Use clear, concise comments for complex logic.

---

By following these guidelines, you help keep the codebase clean, maintainable, and production-ready. Thank you for your contributions! 