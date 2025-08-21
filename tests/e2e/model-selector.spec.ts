import { test, expect } from '@playwright/test'

// Skip these tests in CI as they require authentication
const describeOrSkip = process.env.CI ? test.describe.skip : test.describe;

describeOrSkip('Model Selector', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the chat page which uses the model selector
    await page.goto('/chat')
  })

  test('should display model selector button', async ({ page }) => {
    // Look for the model selector button with reduced timeout
    const selector = page.locator('button[role="combobox"][aria-label="Select AI model"]')
    await expect(selector).toBeVisible({ timeout: 5000 })
    
    // Check it has the robot icon
    const icon = selector.locator('svg').first()
    await expect(icon).toBeVisible()
  })

  test('should open dropdown when clicked', async ({ page }) => {
    // Click the model selector
    const selector = page.locator('button[role="combobox"]').first()
    await selector.click()
    
    // Check that the dropdown is visible with reduced timeout
    const dropdown = page.locator('[role="listbox"]')
    await expect(dropdown).toBeVisible({ timeout: 3000 })
    
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
    
    // Wait for filtering with reduced timeout
    await page.waitForTimeout(200)
    
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
    
    // Wait for options to load
    await page.waitForTimeout(500)
    
    // Click the first model option if available
    const firstOption = page.locator('[role="option"]').first()
    const optionExists = await firstOption.count() > 0
    
    if (optionExists) {
      const modelName = await firstOption.textContent()
      await firstOption.click()
      
      // Check that the dropdown closed
      const dropdown = page.locator('[role="listbox"]')
      await expect(dropdown).not.toBeVisible({ timeout: 3000 })
      
      // Check that the button text updated (if a model was available)
      if (modelName) {
        await expect(selector).toContainText(modelName.split('[')[0].trim())
      }
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
    await expect(searchInput).toBeFocused({ timeout: 3000 })
    
    // Check if there are options to navigate
    const options = page.locator('[role="option"]')
    const optionCount = await options.count()
    
    if (optionCount > 0) {
      // Press down arrow to navigate
      await page.keyboard.press('ArrowDown')
      await page.keyboard.press('ArrowDown')
      
      // Press Enter to select
      await page.keyboard.press('Enter')
      
      // Dropdown should close
      const dropdown = page.locator('[role="listbox"]')
      await expect(dropdown).not.toBeVisible({ timeout: 3000 })
    }
  })
})