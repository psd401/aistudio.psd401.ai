# Playwright MCP E2E Testing Examples

This file demonstrates how to use Playwright MCP with Claude Code to test the application while already logged in.

## How to Run These Tests

1. Start the dev server: `npm run dev`
2. The dev environment automatically logs you in
3. Use Claude Code with Playwright MCP to execute these test scenarios

## Test Scenarios

### 1. Test Admin User Management

```
/e2e-test Admin user management - navigate to /admin/users, verify the page loads, check if user table is visible, try sorting columns
```

### 2. Test Assistant Architect

```
/e2e-test Assistant Architect - navigate to /utilities/assistant-architect, create a new assistant named "Test Assistant", verify it was created, then delete it
```

### 3. Test Model Comparison

```
/e2e-test Model comparison - go to /compare, enter "Write a haiku about testing", select two models, run comparison, verify results are displayed
```

### 4. Test Chat Functionality

```
/e2e-test Chat - navigate to /chat, send a message "Hello, this is a test", wait for response, verify the message appears in history
```

### 5. Test Repository Management

```
/e2e-test Repository management - go to /repositories, create a new repository, edit its description, then delete it
```

### 6. Test Document Upload

```
/e2e-test Document upload - navigate to chat, look for file upload button, verify upload UI is present
```

### 7. Test Navigation and Permissions

```
/e2e-test Navigation - click through all menu items, verify each page loads correctly, check for any permission errors
```

### 8. Test Security

```
/e2e-test Security - try accessing /admin/users, /admin/roles, /admin/settings and verify proper access control
```

## Advantages of Playwright MCP Approach

1. **Already Authenticated**: Uses your existing browser session
2. **Visual Feedback**: See the tests running in real-time
3. **Interactive**: Can pause and inspect at any point
4. **No Setup**: No need to handle authentication flows
5. **Flexible**: Can test any scenario interactively

## Converting to Automated Tests

Once you've validated the test scenarios work with Playwright MCP, you can convert them to automated Playwright tests by:

1. Recording the actions using Playwright MCP
2. Extracting the selectors and actions
3. Creating proper test files with assertions
4. Running in CI with proper test authentication

## Example Conversion

From Playwright MCP exploration:
```
mcp__playwright__browser_navigate({ url: "http://localhost:3000/admin/users" })
mcp__playwright__browser_snapshot()
// Verify: heading "User Management" is visible
```

To automated test:
```typescript
test('should display user management page', async ({ page }) => {
  await page.goto('/admin/users');
  await expect(page.getByRole('heading', { name: 'User Management' })).toBeVisible();
});
```