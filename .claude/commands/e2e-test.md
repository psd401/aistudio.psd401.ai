---
description: Run E2E tests using Playwright MCP
allowed-tools: mcp__playwright__*, Bash, Read, Write, Grep, Glob
---

Run E2E tests for the specified feature or page:
$ARGUMENTS

Use Playwright MCP tools to:
1. Navigate to the page
2. Perform user interactions
3. Assert expected outcomes
4. Generate test code for CI integration

When testing authentication:
- Handle Cognito redirects properly
- Preserve session state between tests
- Use test user credentials from environment

When testing forms:
- Validate field interactions
- Check error states
- Verify success messages
- Test edge cases

Always generate reusable test code that can be migrated to the test suite.