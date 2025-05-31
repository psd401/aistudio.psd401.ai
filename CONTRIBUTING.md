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

## TypeScript & Types
- Use TypeScript for all code.
- Prefer **interfaces** over type aliases.
- Export all types from `types/index.ts`.
- Import types from `@/types`.
- If referring to DB types, use `@/db/schema`.

## Environment Variables
- Never expose secrets or sensitive values to the frontend.
- Use the `NEXT_PUBLIC_` prefix only for variables that must be accessed in the frontend.
- Update `.env.example` when adding or changing environment variables.
- Store all secrets in `.env.local` (never commit this file).
- **DB_LOG_QUERIES**: Set to `true` in `.env.local` to enable Drizzle ORM query logging in development. Leave blank or set to `false` to disable noisy query logs and keep dev logs clean.

## Naming & Imports
- Use **kebab-case** for all files and folders.
- Use the `@` alias for imports unless otherwise specified.

## Components & Folders
- Place shared components in `/components`.
- Place one-off route components in `/_components` within the route.
- Follow project structure and naming conventions.

## Testing
- Add or update tests for new features and bug fixes.
- Do not break existing tests.
- Run all tests before submitting a PR (`npm test`).

## Pull Requests & Code Review
- All PRs must pass CI (lint, build, and tests) before merge.
- All PRs must be reviewed and approved by at least one other contributor.
- Use the PR template and complete all checklist items.

## Documentation
- Update documentation as needed for new features, changes, or fixes.

---

By following these guidelines, you help keep the codebase clean, maintainable, and production-ready. Thank you for your contributions! 