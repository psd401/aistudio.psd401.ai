# E2E Testing Implementation Guide

## Overview

This guide documents the E2E testing framework implementation for AI Studio using Playwright, following a hybrid approach that leverages both Claude Code's Playwright MCP integration for rapid test development and traditional Playwright tests for CI/CD integration.

## Implementation Approach

### Phase 1: Claude Code Integration (Completed)

**Purpose**: Rapid test development and exploration using AI-powered test generation.

**Setup**:
1. Created Claude Code commands (`.claude/commands/e2e-test.md`)
2. Created specialized E2E testing agent (`.claude/agents/e2e-tester.md`)
3. Configured Playwright MCP server for browser automation

**Benefits**:
- Natural language test descriptions
- AI-powered test generation
- Quick iteration and exploration
- Interactive debugging

### Phase 2: Codebase Integration (Completed)

**Purpose**: Production-ready tests integrated with CI/CD pipeline.

**Implementation**:
1. Added Playwright as a dev dependency
2. Created test structure in `tests/e2e/`
3. Configured `playwright.config.ts`
4. Updated CI workflow to run E2E tests
5. Created test fixtures for authentication

## Test Structure

```
tests/e2e/
├── auth/                    # Authentication flow tests
│   └── authentication.spec.ts
├── admin/                   # Admin functionality tests
│   └── user-management.spec.ts
├── assistant-architect/     # AI Assistant tests (TODO)
├── documents/              # Document management tests (TODO)
├── fixtures/               # Test fixtures and helpers
│   └── auth.ts            # Authentication fixtures
├── page-objects/           # Page object models (TODO)
└── README.md              # E2E testing documentation
```

## Test Data Management

### Database Strategy

Test data is managed through SQL scripts in `/infra/database/test-data/`:

1. **Test Users** (`001-test-users.sql`):
   - `test-user-001`: Regular user
   - `test-admin-001`: Admin user
   - `test-limited-001`: Limited access user

2. **Test Documents** (`002-test-documents.sql`):
   - Processed, processing, and failed documents
   - Sample content for search testing

3. **Test Assistants** (`003-test-assistants.sql`):
   - Test AI assistants and conversations

### Isolation Strategy

- **Transaction Rollback**: For unit tests
- **Cleanup After Test**: For E2E tests
- **Test-Specific IDs**: Predictable IDs prefixed with `test-`

## Running Tests

### Local Development

```bash
# Install Playwright browsers (first time)
npx playwright install

# Run all E2E tests
npm run test:e2e

# Run tests in UI mode (recommended for debugging)
npm run test:e2e:ui

# Run tests in headed mode (see browser)
npm run test:e2e:headed

# Run specific test file
npm run test:e2e tests/e2e/auth/authentication.spec.ts
```

### CI/CD

E2E tests run automatically on:
- Pull requests to `main` or `dev` branches
- Pushes to `main` or `dev` branches

Test results are uploaded as artifacts for debugging failures.

## Authentication Handling

### Development Environment

In development, the application uses mock authentication that automatically logs in users without requiring real Cognito credentials.

### Production Environment

For production testing with real Cognito:
1. Set up test user accounts in Cognito
2. Configure environment variables with test credentials
3. Implement OAuth flow handling in test fixtures
4. Handle Cognito redirects and callbacks

## Writing New Tests

### Basic Test Structure

```typescript
import { test, expect } from '@playwright/test';

test.describe('Feature Name', () => {
  test('should perform expected behavior', async ({ page }) => {
    // Arrange
    await page.goto('/some-page');
    
    // Act
    await page.click('button:has-text("Action")');
    
    // Assert
    await expect(page.getByRole('heading')).toHaveText('Result');
  });
});
```

### Using Authentication Fixtures

```typescript
import { test, expect } from '../fixtures/auth';

test('protected route test', async ({ authenticatedPage }) => {
  await authenticatedPage.goto('/protected');
  // User is already authenticated
});
```

## Best Practices

1. **Element Selection**:
   - Use `data-testid` attributes when available
   - Prefer role-based selectors (`getByRole`)
   - Use text selectors as last resort

2. **Wait Strategies**:
   - Rely on Playwright's auto-waiting
   - Use explicit waits only when necessary
   - Avoid `page.waitForTimeout()`

3. **Test Independence**:
   - Each test should run in isolation
   - Don't depend on test execution order
   - Clean up test data after each test

4. **Error Handling**:
   - Take screenshots on failure
   - Use descriptive test names
   - Add helpful error messages in assertions

## Playwright MCP Tools

When using Claude Code for test development:

- `mcp__playwright__browser_navigate` - Navigate to URLs
- `mcp__playwright__browser_click` - Click elements
- `mcp__playwright__browser_type` - Type text
- `mcp__playwright__browser_snapshot` - Get page state
- `mcp__playwright__browser_take_screenshot` - Capture screenshots
- `mcp__playwright__browser_wait_for` - Wait for conditions

## Troubleshooting

### Common Issues

1. **Authentication Failures**:
   - Check if mock auth is enabled in development
   - Verify Cognito configuration for production
   - Check session cookie handling

2. **Flaky Tests**:
   - Add proper wait conditions
   - Check for race conditions
   - Use `test.slow()` for longer operations

3. **CI Failures**:
   - Check environment variables
   - Verify browser installation
   - Review test artifacts for screenshots

### Debug Commands

```bash
# Debug specific test
npx playwright test --debug path/to/test.spec.ts

# View last test report
npx playwright show-report

# View trace file
npx playwright show-trace trace.zip
```

## Future Enhancements

1. **Remaining Test Coverage**:
   - Assistant Architect chat flows
   - Document upload and search
   - Repository integration
   - Settings management

2. **Performance Optimization**:
   - Parallel test execution
   - Shared authentication state
   - Browser context reuse

3. **Advanced Features**:
   - Visual regression testing
   - API mocking
   - Performance metrics
   - Accessibility testing

## References

- [Playwright Documentation](https://playwright.dev)
- [Playwright MCP Server](https://executeautomation.github.io/mcp-playwright/docs/intro)
- [Claude Code Documentation](https://docs.anthropic.com/en/docs/claude-code)
- GitHub Issue: #70