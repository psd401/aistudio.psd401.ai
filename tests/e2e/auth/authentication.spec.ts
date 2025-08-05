import { test, expect } from '@playwright/test';

test.describe('Authentication Flow', () => {

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
    
    // Check for main heading
    await expect(page.getByRole('heading', { name: /Welcome to PSD AI Studio/i })).toBeVisible();
    
    // Check for sign in link
    await expect(page.getByRole('link', { name: 'Sign In with Cognito' })).toBeVisible();
  });
});