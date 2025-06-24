# CLAUDE.md - Development Guidelines

## Build, Lint, Test Commands
```bash
# Development
npm run dev               # Start dev server

# Build
npm run build             # Build for production
npm run start             # Start production server

# Linting
npm run lint              # Run linting

# Testing
npm run test              # Run all tests
npm run test:watch        # Run tests in watch mode
npm test -- <path-to-test-file>  # Run a single test file

# Database
npm run db:generate       # Generate database migrations
npm run db:push           # Push schema changes to database
npm run db:studio         # Open Drizzle Studio UI
```

## Code Style Guidelines

### Project Structure
- `app/` - Next.js App Router pages and layouts
- `components/` - UI components (Shadcn) and feature components
- `actions/` - Server actions for database operations
- `db/` - Database schemas and configuration with Drizzle ORM
- `lib/` - Utility functions and helpers

### Conventions
- Use kebab-case for files/folders (e.g., `user-role-form.tsx`)
- Component files match exported component name
- Use strict TypeScript typing with interfaces preferred
- Server components in app directory, client components with 'use client'
- Import order: React/Next.js, third-party, internal, styles
- Database operations use AWS RDS Data API for new features
- Tests use Jest with React Testing Library (.test.ts/.test.tsx)

### Authentication
- Use AWS Cognito for authentication instead of Clerk
- Import `getServerSession()` from `/lib/auth/server-session.ts` for auth checks
- Use `hasToolAccess()` from `/lib/db/data-api-adapter.ts` for role-based access
- Protected routes should check authentication and tool access

### Database Access
- **For new features and migrated code**: Use AWS RDS Data API
  - Import `executeSQL()` from `/lib/db/data-api-adapter.ts`
  - Use parameterized SQL queries with proper type mapping
  - Parameter types: `stringValue`, `longValue`, `booleanValue`, `isNull`
- **For legacy code**: Still uses Drizzle ORM
  - Import database from `/db/db.ts`
  - Use schema definitions from `/db/schema/index.ts`
- Follow naming convention: tables have `Table` suffix in schema
- Types use `InsertX` and `SelectX` naming convention

### Error Handling
- Use `createError()` from `/lib/error-utils.ts` to create structured errors
- Use `handleError()` from `/lib/error-utils.ts` in server actions and API routes
- Use `createSuccess()` for successful action responses
- Server actions should return `ActionState<T>` type from `/types/actions-types.ts`
- API routes should use `withErrorHandling()` from `/lib/api-utils.ts`
- React components should use `useAction()` hook from `/lib/hooks/use-action.ts`
- Use migration script to update existing code: `npx ts-node scripts/migrate-error-handling.ts`