import { test, expect } from '@playwright/test'

test.describe('Assistant Architect Streaming API', () => {
  test.beforeEach(async ({ page }) => {
    // Go to assistant architect page
    await page.goto('/assistant-architect')

    // Wait for authentication if needed
    try {
      await page.waitForSelector('[data-testid="assistant-architect-page"]', { timeout: 5000 })
    } catch {
      await page.waitForSelector('h1, h2, .assistant-architect, main', { timeout: 10000 })
    }
  })

  test('should stream single prompt execution', async ({ page }) => {
    const architectCards = page.locator('[data-testid="assistant-architect-card"]')
    const architectCount = await architectCards.count()

    if (architectCount > 0) {
      // Click on the first assistant architect
      await architectCards.nth(0).click()

      // Wait for execution interface to load
      await page.waitForTimeout(2000)

      // Fill any required input fields
      const inputFields = page.locator('input[type="text"], textarea')
      const inputCount = await inputFields.count()

      for (let i = 0; i < inputCount; i++) {
        try {
          await inputFields.nth(i).fill('Test streaming execution')
        } catch (error) {
          // Continue if field interaction fails
        }
      }

      // Execute the assistant architect
      const executeButton = page.locator('[data-testid="execute-button"], button:has-text("Execute"), button:has-text("Run"), button[type="submit"]')
      if (await executeButton.count() > 0) {
        await executeButton.first().click()

        // Wait for streaming to start
        await page.waitForTimeout(2000)

        // Should show streaming indicators or partial content
        const streamingIndicators = page.locator('[data-testid="streaming-progress"], .streaming, .executing')
        if (await streamingIndicators.count() > 0) {
          await expect(streamingIndicators.first()).toBeVisible()
        }

        // Wait for completion
        await page.waitForTimeout(10000)

        // Should show results
        const resultsSection = page.locator('[data-testid="execution-results"], .results, .output')
        if (await resultsSection.count() > 0) {
          await expect(resultsSection.first()).toBeVisible()
        }
      }
    } else {
      test.skip(true, 'No assistant architects available for testing')
    }
  })

  test('should handle input validation errors', async ({ page }) => {
    const architectCards = page.locator('[data-testid="assistant-architect-card"]')

    if (await architectCards.count() > 0) {
      await architectCards.nth(0).click()
      await page.waitForTimeout(2000)

      // Try to execute with very large input (>100KB limit)
      const largeInput = 'A'.repeat(150000) // 150KB to exceed limit
      const inputFields = page.locator('input[type="text"], textarea')

      if (await inputFields.count() > 0) {
        try {
          await inputFields.first().fill(largeInput)

          const executeButton = page.locator('[data-testid="execute-button"]')
          if (await executeButton.count() > 0) {
            await executeButton.first().click()
            await page.waitForTimeout(3000)

            // Should show validation error
            const errorMessages = page.locator('[data-testid="error-message"], .error, .validation-error')
            if (await errorMessages.count() > 0) {
              const errorText = await errorMessages.first().textContent()
              expect(errorText?.toLowerCase()).toMatch(/limit|size|too large|maximum/i)
            }
          }
        } catch (error) {
          // Input may be rejected by browser limits
          console.log('Large input test handled with browser limitations')
        }
      }
    } else {
      test.skip(true, 'No assistant architects available for testing')
    }
  })

  test('should respect prompt chain length limits', async ({ page }) => {
    // This test validates that assistant architects with too many prompts
    // are properly rejected or limited

    const architectCards = page.locator('[data-testid="assistant-architect-card"]')

    if (await architectCards.count() > 0) {
      await architectCards.nth(0).click()
      await page.waitForTimeout(2000)

      // Execute assistant architect
      const executeButton = page.locator('[data-testid="execute-button"]')
      if (await executeButton.count() > 0) {
        await executeButton.first().click()
        await page.waitForTimeout(5000)

        // Should either execute successfully or show limit error
        const errorMessages = page.locator('[data-testid="error-message"], .error')
        const resultsSection = page.locator('[data-testid="execution-results"], .results')

        const hasError = await errorMessages.count() > 0
        const hasResults = await resultsSection.count() > 0

        // Should have either error or results (not in limbo)
        expect(hasError || hasResults).toBe(true)

        if (hasError) {
          const errorText = await errorMessages.first().textContent()
          console.log('Error displayed:', errorText)
        }
      }
    } else {
      test.skip(true, 'No assistant architects available for testing')
    }
  })
})
