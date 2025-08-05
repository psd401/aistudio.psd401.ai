# E2E Tests

This directory contains Playwright end-to-end tests for AI Studio.

## Directory Structure

- `auth/` - Authentication and authorization tests
- `admin/` - Admin panel functionality tests  
- `assistant-architect/` - AI assistant configuration tests
- `chat/` - Chat interface tests
- `compare/` - Model comparison feature tests
- `documents/` - Document management tests
- `repositories/` - Knowledge repository tests
- `fixtures/` - Shared test fixtures and utilities
- `page-objects/` - Page object models for test maintainability

## Running Tests

```bash
# Run all tests
npm run test:e2e

# Run with UI (recommended for development)
npm run test:e2e:ui

# Run specific test file
npm run test:e2e working-tests.spec.ts
```

## Writing New Tests

1. Create test files with `.spec.ts` extension
2. Use the appropriate subdirectory for your feature
3. Import fixtures from `./fixtures/` for common functionality
4. Follow the patterns in `working-tests.spec.ts`

## Test Data

Test data SQL scripts are located in `/infra/database/test-data/`:
- `001-test-users.sql` - Test user accounts
- `002-test-documents.sql` - Sample documents
- `003-test-assistants.sql` - Test AI assistants

## Authentication in Tests

Due to the complexity of AWS Cognito + Google OAuth, we use a hybrid approach:

1. **Local Development**: Use Playwright MCP with your logged-in browser session
2. **CI/CD**: Tests requiring auth are skipped; only public page tests run

See authentication fixtures in `fixtures/auth.ts` for implementation details.

## Playwright MCP Examples

See `playwright-mcp-examples.md` for interactive testing examples using Claude Code.

## Main Documentation

For comprehensive E2E testing documentation, see `/docs/E2E_TESTING.md`