# E2E Testing with Playwright

This directory contains end-to-end tests for the AI Studio application using Playwright.

## Structure

```
tests/e2e/
├── auth/                    # Authentication flow tests
├── admin/                   # Admin functionality tests
├── assistant-architect/     # AI Assistant tests
├── documents/              # Document management tests
├── fixtures/               # Test fixtures and helpers
└── page-objects/           # Page object models
```

## Running Tests

### Local Development

```bash
# Install Playwright browsers (first time only)
npx playwright install

# Run all tests
npm run test:e2e

# Run tests in headed mode (see browser)
npm run test:e2e -- --headed

# Run specific test file
npm run test:e2e tests/e2e/auth/authentication.spec.ts

# Run tests in UI mode (recommended for debugging)
npx playwright test --ui

# Generate test code with codegen
npx playwright codegen http://localhost:3000
```

### CI/CD

Tests run automatically on pull requests. See `.github/workflows/ci.yml` for configuration.

## Writing Tests

### Basic Test Structure

```typescript
import { test, expect } from '@playwright/test';

test.describe('Feature Name', () => {
  test('should perform expected behavior', async ({ page }) => {
    // Arrange
    await page.goto('/some-page');
    
    // Act
    await page.click('button:has-text("Click Me")');
    
    // Assert
    await expect(page.getByRole('heading')).toHaveText('Success');
  });
});
```

### Using Authentication Fixtures

```typescript
import { test, expect } from '../fixtures/auth';

test('should access protected route', async ({ authenticatedPage }) => {
  await authenticatedPage.goto('/protected-route');
  // User is already authenticated
});

test('should access admin route', async ({ adminPage }) => {
  await adminPage.goto('/admin/users');
  // User is authenticated as admin
});
```

## Test Data

Test data SQL scripts are located in `/infra/database/test-data/`:
- `001-test-users.sql` - Test user accounts
- `002-test-documents.sql` - Test documents
- `003-test-assistants.sql` - Test AI assistants

## Environment Variables

Create `.env.test.local` for test-specific configuration:

```env
# Test user credentials (when using real Cognito)
TEST_USER_EMAIL=test.user@example.com
TEST_USER_PASSWORD=TestPassword123!
TEST_ADMIN_EMAIL=test.admin@example.com
TEST_ADMIN_PASSWORD=AdminPassword123!

# Test environment URLs
PLAYWRIGHT_BASE_URL=http://localhost:3000
```

## Best Practices

1. **Use data-testid attributes** for reliable element selection
2. **Avoid hard-coded waits** - use Playwright's auto-waiting
3. **Keep tests independent** - each test should run in isolation
4. **Use Page Object Model** for complex pages
5. **Take screenshots** on failure for debugging
6. **Mock external services** when possible
7. **Clean up test data** after each test

## Debugging

### View test results
```bash
npx playwright show-report
```

### Debug a specific test
```bash
npx playwright test --debug tests/e2e/auth/authentication.spec.ts
```

### View trace on failure
```bash
npx playwright show-trace trace.zip
```

## Common Issues

### Cognito Authentication
In development, the app uses mock authentication. In production:
1. Real Cognito credentials are required
2. OAuth flow handling needs to be implemented
3. Consider using Cognito test users

### Flaky Tests
If tests are flaky:
1. Check for proper wait conditions
2. Ensure test data isolation
3. Add retry logic for network operations
4. Use `test.slow()` for longer operations

### Parallel Execution
Tests run in parallel by default. If this causes issues:
1. Use `test.describe.serial()` for dependent tests
2. Ensure unique test data per test
3. Configure workers in playwright.config.ts