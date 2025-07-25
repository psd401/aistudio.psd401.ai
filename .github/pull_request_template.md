## Description

<!-- What does this PR do? Summarize the change and why it is needed. -->

## Checklist

- [ ] No `console.*` calls in production/shared code; all server-side logging uses Winston logger (`@/lib/logger`)
- [ ] **No imports or usage of `@/lib/logger` in client components or client hooks**
- [ ] Client code uses `console.error` only for actionable errors in development (never for routine info)
- [ ] Lint passes (`npm run lint`)
- [ ] All tests pass (`npm test`)
- [ ] Types/interfaces follow project conventions
- [ ] No type assertions (`as any`) without justification
- [ ] Database field names use snake_case (automatic camelCase transformation handled by data API adapter)
- [ ] TypeScript strict mode errors resolved
- [ ] Environment variables handled securely and `.env.example` updated if needed
- [ ] Documentation updated (if needed)
- [ ] Code reviewed and approved
- [ ] App builds and runs without module errors (e.g., no 'fs' errors in browser)

## Related Issues

<!-- Link to any related issues or tickets --> 