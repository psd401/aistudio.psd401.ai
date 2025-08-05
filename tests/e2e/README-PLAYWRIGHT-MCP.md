# E2E Testing Strategy with Playwright MCP

## Overview

We use a hybrid approach for E2E testing:

1. **Playwright MCP (Interactive Testing)** - For development and exploration using your logged-in browser session
2. **Traditional Playwright Tests** - For CI/CD with tests that don't require authentication

## Why This Approach?

The application uses AWS Cognito with Google OAuth, which is complex to automate. Instead of fighting the authentication system, we leverage:

- **Development**: Playwright MCP with your existing session
- **CI/CD**: Tests that work without authentication

## Playwright MCP Testing (Recommended for Feature Testing)

### Setup

1. Ensure Claude Code has Playwright MCP configured
2. Start the dev server: `npm run dev`
3. You'll be automatically logged in with mock authentication

### Testing Features

Use Claude Code to test authenticated features:

```
/e2e-test Navigate to /admin/users and verify the user table shows at least 10 users

/e2e-test Go to /compare, select two models, enter "test prompt", and verify results appear

/e2e-test Test chat at /chat - select a model, send a message, verify response

/e2e-test Navigate to /repositories and test creating a new repository
```

### Benefits

- ✅ No authentication complexity
- ✅ Visual feedback
- ✅ Interactive debugging
- ✅ Rapid iteration
- ✅ Uses your actual session

## Traditional Playwright Tests (CI/CD)

### What We Can Test

1. **Public Pages**
   - Home page elements
   - Sign in page
   - Route protection (redirects)

2. **UI Structure** (without interaction)
   - Page layouts
   - Element presence
   - Navigation structure

### Running Tests

```bash
# Run all working tests
npm run test:e2e tests/e2e/working-tests.spec.ts

# Run in UI mode for debugging
npm run test:e2e:ui
```

## Test Organization

```
tests/e2e/
├── working-tests.spec.ts        # Tests that actually pass
├── playwright-mcp-examples.md   # Examples for MCP testing
├── README-PLAYWRIGHT-MCP.md     # This file
└── [archived]/                  # Tests requiring auth (for reference)
```

## Future Improvements

When proper test authentication is needed:

1. **Option 1**: Create test-specific Cognito user pool
2. **Option 2**: Implement mock authentication for tests
3. **Option 3**: Use API-based authentication bypass for tests

## Best Practices

1. **Use Playwright MCP** for:
   - Feature development
   - Bug reproduction
   - Exploratory testing
   - Visual verification

2. **Use Traditional Tests** for:
   - CI/CD pipeline
   - Regression testing
   - Public page validation
   - Security checks

## Example Workflow

1. **Develop Feature** → Test with Playwright MCP
2. **Validate Behavior** → Record actions and selectors
3. **Create Test** → Write traditional test if possible
4. **Document** → Add to MCP examples if auth required

This approach gives us the best of both worlds: comprehensive testing during development with Playwright MCP, and automated regression testing in CI/CD where possible.