# E2E Testing Guide

## Overview

AI Studio uses Playwright for end-to-end testing with a hybrid approach:
- **Development**: Playwright MCP integration for interactive testing with logged-in sessions
- **CI/CD**: Traditional Playwright tests for automated testing without authentication

## Quick Start

### Running Tests

```bash
# Run all E2E tests
npm run test:e2e

# Run in UI mode (interactive)
npm run test:e2e:ui

# Run specific test file
npm run test:e2e tests/e2e/working-tests.spec.ts
```

### Using Playwright MCP (Development)

When developing new features, use the Playwright MCP integration in Claude Code:

```bash
# In Claude Code, while logged into the app:
/e2e-test Navigate to /admin/users and verify the user table loads
/e2e-test Test chat functionality - send "Hello AI" and verify response
/e2e-test Click on Compare Models and verify the page loads
```

## Test Structure

```
tests/e2e/
├── auth/                    # Authentication flow tests
├── admin/                   # Admin functionality tests
├── assistant-architect/     # AI Assistant tests
├── chat/                    # Chat interface tests
├── compare/                 # Model comparison tests
├── documents/              # Document management tests
├── repositories/           # Repository management tests
├── fixtures/               # Test fixtures and helpers
│   └── auth.ts            # Authentication fixtures
├── page-objects/           # Page object models
├── working-tests.spec.ts   # Tests that run in CI
└── README.md              # Test-specific documentation
```

## Testing Strategy

### 1. Development Testing (Playwright MCP)

**When to use**: During feature development when you need to test authenticated features

**Benefits**:
- Uses your existing browser session (no auth setup needed)
- Interactive testing with visual feedback
- AI-powered test generation
- Quick iteration

**Example workflow**:
1. Log into the application in your browser
2. Use `/e2e-test` command in Claude Code
3. Describe what you want to test
4. Claude will execute the test and report results

### 2. CI/CD Testing (Traditional Playwright)

**When to use**: For automated testing in CI/CD pipeline

**Current limitations**:
- Tests requiring authentication are skipped in CI
- Focus on public pages and basic functionality

**Example tests**:
- Homepage loads correctly
- Protected routes redirect to sign-in
- Sign-in page displays properly

## Writing Tests

### Basic Test Structure

```typescript
import { test, expect } from '@playwright/test';

test.describe('Feature Name', () => {
  test('should do something', async ({ page }) => {
    await page.goto('/path');
    await expect(page.getByRole('heading')).toContainText('Expected Text');
  });
});
```

### Using Authentication Fixtures

```typescript
import { test, expect } from './fixtures/auth';

test('admin feature', async ({ adminPage }) => {
  await adminPage.goto('/admin/users');
  // adminPage is already authenticated
});
```

### Skipping Tests in CI

```typescript
const describeOrSkip = process.env.CI ? test.describe.skip : test.describe;

describeOrSkip('Tests requiring auth', () => {
  // These tests only run locally
});
```

## Best Practices

1. **Test Organization**
   - Group related tests in descriptive folders
   - Use clear, descriptive test names
   - Keep tests focused and atomic

2. **Selectors**
   - Prefer semantic selectors: `getByRole()`, `getByText()`, `getByLabel()`
   - Avoid brittle CSS selectors
   - Use data-testid when semantic selectors aren't available

3. **Assertions**
   - Use Playwright's auto-waiting assertions
   - Be specific about what you're testing
   - Test user-visible behavior, not implementation details

4. **Test Data**
   - Use test data SQL scripts in `infra/database/test-data/`
   - Clean up test data after tests
   - Don't rely on specific database state

## CI/CD Integration

E2E tests run automatically on:
- Pull requests to main/dev branches
- Pushes to main/dev branches

The CI workflow:
1. Installs dependencies
2. Installs Playwright browsers
3. Runs tests (skipping auth-required tests)
4. Uploads test reports as artifacts

## Troubleshooting

### Tests failing in CI but passing locally
- Check if the test requires authentication
- Ensure the test doesn't depend on local environment
- Review the test artifacts in GitHub Actions

### Authentication issues
- For local testing: Ensure you're logged into the app
- For CI testing: Only non-authenticated tests will run

### Timeout errors
- Increase timeout for slower operations
- Use `waitForLoadState('networkidle')` for dynamic content
- Check if the app is actually running (for local tests)

## Future Enhancements

1. **Test Authentication**: Implement proper test authentication for CI
2. **Visual Testing**: Add screenshot comparison tests
3. **Performance Testing**: Add metrics collection
4. **API Testing**: Integrate API tests with E2E flows

## Related Documentation

- [Playwright Documentation](https://playwright.dev)
- Test implementation details: `/tests/e2e/README.md`
- Test examples: `/tests/e2e/playwright-mcp-examples.md`