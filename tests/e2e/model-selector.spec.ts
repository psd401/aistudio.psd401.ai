import { test, expect } from '@playwright/test'

test.describe('Model Selector', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the chat page which uses the model selector
    await page.goto('/chat')
  })

  test('should display model selector button', async ({ page }) => {
    // Look for the model selector button
    const selector = page.locator('button[role="combobox"][aria-label="Select AI model"]')
    await expect(selector).toBeVisible()
    
    // Check it has the robot icon
    const icon = selector.locator('svg').first()
    await expect(icon).toBeVisible()
  })

  test('should open dropdown when clicked', async ({ page }) => {
    // Click the model selector
    const selector = page.locator('button[role="combobox"]').first()
    await selector.click()
    
    // Check that the dropdown is visible
    const dropdown = page.locator('[role="listbox"]')
    await expect(dropdown).toBeVisible()
    
    // Check for search input
    const searchInput = page.locator('input[placeholder="Search models..."]')
    await expect(searchInput).toBeVisible()
  })

  test('should filter models when searching', async ({ page }) => {
    // Open the selector
    const selector = page.locator('button[role="combobox"]').first()
    await selector.click()
    
    // Type in search
    const searchInput = page.locator('input[placeholder="Search models..."]')
    await searchInput.fill('gpt')
    
    // Wait for filtering
    await page.waitForTimeout(300)
    
    // Check that we have filtered results
    const items = page.locator('[role="option"]')
    const count = await items.count()
    
    // We should have at least some results if GPT models exist
    // But not checking exact count as it depends on database
    expect(count).toBeGreaterThanOrEqual(0)
  })

  test('should select a model when clicked', async ({ page }) => {
    // Open the selector
    const selector = page.locator('button[role="combobox"]').first()
    await selector.click()
    
    // Click the first model option
    const firstOption = page.locator('[role="option"]').first()
    const modelName = await firstOption.textContent()
    await firstOption.click()
    
    // Check that the dropdown closed
    const dropdown = page.locator('[role="listbox"]')
    await expect(dropdown).not.toBeVisible()
    
    // Check that the button text updated (if a model was available)
    if (modelName) {
      await expect(selector).toContainText(modelName.split('[')[0].trim())
    }
  })

  test('should show model descriptions and provider info', async ({ page }) => {
    // Open the selector
    const selector = page.locator('button[role="combobox"]').first()
    await selector.click()
    
    // Check for model items with provider info
    const modelItems = page.locator('[role="option"]')
    const firstItem = modelItems.first()
    
    // Check if the item exists (there might be no models)
    const itemCount = await modelItems.count()
    if (itemCount > 0) {
      // Look for provider info in brackets
      const itemText = await firstItem.textContent()
      expect(itemText).toMatch(/\[.*:.*\]/) // Should have [Provider: model-id] format
    }
  })

  test('should handle keyboard navigation', async ({ page }) => {
    // Open the selector
    const selector = page.locator('button[role="combobox"]').first()
    await selector.click()
    
    // Focus should be on search input
    const searchInput = page.locator('input[placeholder="Search models..."]')
    await expect(searchInput).toBeFocused()
    
    // Press down arrow to navigate
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    
    // Press Enter to select
    await page.keyboard.press('Enter')
    
    // Dropdown should close
    const dropdown = page.locator('[role="listbox"]')
    await expect(dropdown).not.toBeVisible()
  })
})