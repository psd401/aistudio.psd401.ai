import { test, expect } from '@playwright/test';

/**
 * These tests work because they don't require authentication
 * or use the dev environment's automatic authentication
 */

// Skip these tests in CI as they require a running server
const describeOrSkip = process.env.CI ? test.describe.skip : test.describe;

describeOrSkip('Public Pages', () => {
  test('should display home page', async ({ page }) => {
    await page.goto('/');
    // Wait for page to load
    await page.waitForLoadState('networkidle');
    
    // The home page might show different content based on auth state
    // Just verify we're on the home page and not redirected
    await expect(page).toHaveURL('/');
    
    // Look for either the welcome message or loading state
    const welcomeHeading = page.getByRole('heading', { name: /Welcome to PSD AI Studio/i });
    const loadingText = page.getByText('Loading...');
    
    // At least one should be visible
    await expect(welcomeHeading.or(loadingText)).toBeVisible();
  });

  test('should display only one sign-in button when not authenticated', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Check that there's only one "Sign In" button on the page
    const signInButtons = page.getByRole('button', { name: /Sign In/i });
    await expect(signInButtons).toHaveCount(1);
    
    // Verify the button text is "Sign In" (not "Sign In with Cognito")
    await expect(signInButtons).toHaveText('Sign In');
  });

  test('should protect routes from unauthenticated access', async ({ page }) => {
    const protectedRoutes = ['/dashboard', '/chat', '/admin/users', '/compare', '/repositories'];
    
    for (const route of protectedRoutes) {
      await page.goto(route);
      await expect(page).toHaveURL(/\/api\/auth\/signin/);
    }
  });

  test('should trigger sign in when clicking the button', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Click the sign in button
    const signInButton = page.getByRole('button', { name: 'Sign In' });
    
    // Verify the button exists and is clickable
    await expect(signInButton).toBeVisible();
    await expect(signInButton).toBeEnabled();
    
    // Click will trigger signIn('cognito') function
    await signInButton.click();
    
    // Should navigate away from home page (to Cognito)
    await page.waitForTimeout(1000);
    expect(page.url()).not.toBe('http://localhost:3000/');
  });
});

/**
 * For authenticated tests, we recommend using Playwright MCP in Claude Code
 * because it uses your existing browser session where you're already logged in.
 * 
 * Example commands:
 * - /e2e-test Navigate to /admin/users and verify the user table is visible
 * - /e2e-test Go to /chat and send a test message
 * - /e2e-test Test model comparison at /compare
 * 
 * See tests/e2e/playwright-mcp-examples.md for more examples
 */

// If you need automated authenticated tests for CI/CD, you would need to:
// 1. Set up test users in Cognito
// 2. Handle the OAuth flow programmatically
// 3. Or use a different authentication method for testing

test.describe.skip('Authenticated Features (requires login)', () => {
  // These tests are skipped by default but show the structure
  
  test('should display admin user management', async ({ page }) => {
    // This would require authentication
    await page.goto('/admin/users');
    await expect(page.getByRole('heading', { name: 'User Management' })).toBeVisible();
  });

  test('should allow chat interaction', async ({ page }) => {
    // This would require authentication
    await page.goto('/chat');
    await page.getByPlaceholder(/type.*message/i).fill('Test message');
    await page.getByPlaceholder(/type.*message/i).press('Enter');
  });
});