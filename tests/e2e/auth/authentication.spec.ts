import { test, expect } from '@playwright/test';

// Skip these tests in CI as they require a running server
const describeOrSkip = process.env.CI ? test.describe.skip : test.describe;

describeOrSkip('Authentication Flow', () => {

  test('should protect routes from unauthenticated access', async ({ page }) => {
    // Test that protected routes redirect to sign in
    const protectedRoutes = [
      '/dashboard',
      '/chat',
      '/admin/users',
      '/compare',
      '/repositories'
    ];

    for (const route of protectedRoutes) {
      await page.goto(route);
      // Should redirect to sign in
      await expect(page).toHaveURL(/\/api\/auth\/signin/);
    }
  });

  test('should show sign in page', async ({ page }) => {
    // Navigate to sign in page
    await page.goto('/api/auth/signin');
    
    // Verify sign in page elements
    await expect(page.getByRole('button', { name: 'Sign in with Cognito' })).toBeVisible();
  });

  test('should display home page elements', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Verify we're on the home page
    await expect(page).toHaveURL('/');
    
    // Look for either the welcome message or loading state
    const welcomeHeading = page.getByRole('heading', { name: /Welcome to PSD AI Studio/i });
    const loadingText = page.getByText('Loading...');
    
    // At least one should be visible
    await expect(welcomeHeading.or(loadingText)).toBeVisible();
  });
});