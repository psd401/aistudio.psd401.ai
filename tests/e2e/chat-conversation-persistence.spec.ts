import { test, expect } from '@playwright/test'

test.describe('Chat Conversation Persistence', () => {
  test.beforeEach(async ({ page }) => {
    // Note: These tests assume user is already authenticated
    // For CI/CD, you may need to add authentication steps or use test accounts
    await page.goto('/chat')
  })

  test('should maintain single conversation ID across multiple messages', async ({ page }) => {
    // Start a new conversation
    await page.fill('textarea[name="message"]', 'First message in conversation')
    await page.keyboard.press('Enter')
    
    // Wait for response
    await page.waitForSelector('text=/First message/', { timeout: 10000 })
    
    // Check URL has conversation parameter
    await expect(page).toHaveURL(/conversation=\d+/)
    const firstUrl = page.url()
    const conversationId = firstUrl.match(/conversation=(\d+)/)?.[1]
    
    // Send second message
    await page.fill('textarea[name="message"]', 'Second message in same conversation')
    await page.keyboard.press('Enter')
    
    // Wait for response
    await page.waitForSelector('text=/Second message/', { timeout: 10000 })
    
    // Verify URL still has same conversation ID
    await expect(page).toHaveURL(new RegExp(`conversation=${conversationId}`))
  })

  test('should update conversation list when new conversation is created', async ({ page }) => {
    // Count initial conversations
    const initialCount = await page.locator('[data-testid="conversation-item"]').count()
    
    // Start a new conversation
    await page.fill('textarea[name="message"]', 'Test conversation for sidebar')
    await page.keyboard.press('Enter')
    
    // Wait for response and conversation to appear in sidebar
    await page.waitForSelector('text=/Test conversation/', { timeout: 10000 })
    
    // Verify conversation appears in sidebar (may need slight delay for event)
    await page.waitForTimeout(1000)
    const newCount = await page.locator('[data-testid="conversation-item"]').count()
    expect(newCount).toBeGreaterThan(initialCount)
  })

  test('should handle polling with exponential backoff for streaming responses', async ({ page }) => {
    // Monitor network requests to verify exponential backoff
    const requests: number[] = []
    page.on('request', request => {
      if (request.url().includes('/api/conversations?latest=true')) {
        requests.push(Date.now())
      }
    })
    
    // Send a message that triggers streaming
    await page.fill('textarea[name="message"]', 'Test streaming response')
    await page.keyboard.press('Enter')
    
    // Wait for polling to complete
    await page.waitForTimeout(5000)
    
    // Verify requests follow exponential backoff pattern
    if (requests.length > 1) {
      for (let i = 1; i < requests.length; i++) {
        const delay = requests[i] - requests[i - 1]
        // Each delay should be roughly double the previous (with some tolerance)
        if (i > 1) {
          const prevDelay = requests[i - 1] - requests[i - 2]
          expect(delay).toBeGreaterThanOrEqual(prevDelay * 1.5)
        }
      }
    }
  })
})

test.describe('Mobile Responsiveness', () => {
  test('should show tabs on mobile for model comparison', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto('/compare')
    
    // Check that tabs are visible on mobile
    await expect(page.locator('[role="tablist"]')).toBeVisible()
    
    // Check that grid layout is hidden
    await expect(page.locator('.grid.grid-cols-2')).toBeHidden()
    
    // Test tab switching
    const tab2 = page.locator('[role="tab"]').nth(1)
    await tab2.click()
    await expect(tab2).toHaveAttribute('data-state', 'active')
  })

  test('should show side-by-side on desktop for model comparison', async ({ page }) => {
    // Set desktop viewport
    await page.setViewportSize({ width: 1920, height: 1080 })
    await page.goto('/compare')
    
    // Check that grid layout is visible on desktop
    await expect(page.locator('.grid.grid-cols-2')).toBeVisible()
    
    // Check that tabs are hidden
    await expect(page.locator('[role="tablist"]')).toBeHidden()
  })
})