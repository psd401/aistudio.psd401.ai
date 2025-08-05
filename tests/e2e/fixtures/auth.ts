import { test as base, Page } from '@playwright/test';

// Extend the base test with authentication fixtures
export const test = base.extend<{
  authenticatedPage: Page;
  adminPage: Page;
}>({
  // Regular authenticated user fixture
  authenticatedPage: async ({ page }, use) => {
    // Navigate to sign in
    await page.goto('/api/auth/signin');
    
    // Click sign in with Cognito
    await page.click('button:has-text("Sign in with Cognito")');
    
    // Wait for authentication to complete
    await page.waitForURL('/dashboard', { timeout: 30000 });
    
    // Use the authenticated page
    await use(page);
    
    // Sign out after test
    await page.click('button:has-text("Sign out")');
  },

  // Admin authenticated user fixture  
  adminPage: async ({ page }, use) => {
    // Navigate to sign in
    await page.goto('/api/auth/signin');
    
    // Click sign in with Cognito
    await page.click('button:has-text("Sign in with Cognito")');
    
    // Wait for authentication to complete
    await page.waitForURL('/dashboard', { timeout: 30000 });
    
    // TODO: Add logic to ensure admin role when proper auth is implemented
    
    // Use the admin page
    await use(page);
    
    // Sign out after test
    await page.click('button:has-text("Sign out")');
  },
});

export { expect } from '@playwright/test';

/**
 * Helper function to handle Cognito authentication
 * This will need to be updated when real Cognito auth is implemented
 */
export async function authenticateUser(page: Page, credentials?: { email: string; password: string }) {
  await page.goto('/api/auth/signin');
  
  // Wait for page load
  await page.waitForLoadState('networkidle');
  
  // Click sign in button
  await page.getByRole('button', { name: 'Sign in with Cognito' }).click();
  
  // In development, this automatically logs in
  // In production with real Cognito, we would need to:
  // 1. Wait for Cognito hosted UI
  // 2. Fill in credentials
  // 3. Submit form
  // 4. Handle OAuth callback
  
  // Wait for redirect to dashboard
  await page.waitForURL('/dashboard', { timeout: 30000 });
  await page.waitForLoadState('networkidle');
}