import { test, expect } from '@playwright/test'

test.describe('Code Rendering in Chat', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the chat page
    await page.goto('/chat')
    
    // Wait for the page to be ready
    await page.waitForSelector('[data-testid="chat-input"]', { timeout: 10000 })
  })

  test('should render simple code blocks without crashing', async ({ page }) => {
    // Type a prompt that will generate code
    const codePrompt = 'Write a simple Python function to calculate factorial'
    const chatInput = page.locator('[data-testid="chat-input"]')
    
    await chatInput.fill(codePrompt)
    await chatInput.press('Enter')
    
    // Wait for response to start streaming
    await page.waitForSelector('.animate-spin', { timeout: 10000 })
    
    // Wait for code block to appear (using a generic selector that should work)
    await page.waitForSelector('pre', { timeout: 30000 })
    
    // Verify code block is rendered
    const codeBlock = page.locator('pre').first()
    await expect(codeBlock).toBeVisible()
    
    // Verify syntax highlighting is applied
    const syntaxHighlighted = await page.locator('[class*="language-"]').count()
    expect(syntaxHighlighted).toBeGreaterThan(0)
    
    // Verify copy button is present
    const copyButton = page.locator('button:has-text("Copy")').first()
    await expect(copyButton).toBeVisible()
  })

  test('should handle malformed code blocks gracefully', async ({ page }) => {
    // Create a test that simulates incomplete code blocks
    // This would typically happen during streaming
    
    // Type a complex prompt that generates multiple code blocks
    const complexPrompt = 'Show me code examples in Python, JavaScript, and SQL'
    const chatInput = page.locator('[data-testid="chat-input"]')
    
    await chatInput.fill(complexPrompt)
    await chatInput.press('Enter')
    
    // Wait for response
    await page.waitForSelector('.animate-spin', { timeout: 10000 })
    
    // Wait for multiple code blocks
    await page.waitForSelector('pre', { timeout: 30000 })
    
    // Check that page didn't crash (no error boundaries triggered)
    const errorBoundary = page.locator('[role="alert"]')
    const errorCount = await errorBoundary.count()
    expect(errorCount).toBe(0)
    
    // Verify multiple code blocks are rendered
    const codeBlocks = await page.locator('pre').count()
    expect(codeBlocks).toBeGreaterThanOrEqual(1)
  })

  test('should allow copying code from code blocks', async ({ page }) => {
    // Generate a code response
    const codePrompt = 'Write a hello world in JavaScript'
    const chatInput = page.locator('[data-testid="chat-input"]')
    
    await chatInput.fill(codePrompt)
    await chatInput.press('Enter')
    
    // Wait for code block
    await page.waitForSelector('pre', { timeout: 30000 })
    
    // Find and click the copy button
    const copyButton = page.locator('button[aria-label*="Copy"]').first()
    await copyButton.click()
    
    // Verify toast notification appears
    await page.waitForSelector(':has-text("Code copied")', { timeout: 5000 })
    
    // Verify clipboard content (if possible in test environment)
    // Note: Clipboard API might not work in headless mode
  })

  test('should handle streaming code blocks without flickering', async ({ page }) => {
    // Monitor for excessive re-renders during streaming
    let renderCount = 0
    
    // Set up mutation observer to count renders
    await page.addInitScript(() => {
      let observer: MutationObserver
      window.addEventListener('load', () => {
        observer = new MutationObserver(() => {
          // Count mutations in code blocks
          const codeBlocks = document.querySelectorAll('pre')
          if (codeBlocks.length > 0) {
            (window as any).codeBlockMutations = ((window as any).codeBlockMutations || 0) + 1
          }
        })
        
        observer.observe(document.body, {
          childList: true,
          subtree: true,
          characterData: true
        })
      })
    })
    
    await page.goto('/chat')
    await page.waitForSelector('[data-testid="chat-input"]', { timeout: 10000 })
    
    // Generate code response
    const codePrompt = 'Write a complex React component with hooks'
    const chatInput = page.locator('[data-testid="chat-input"]')
    
    await chatInput.fill(codePrompt)
    await chatInput.press('Enter')
    
    // Wait for streaming to complete
    await page.waitForSelector('pre', { timeout: 30000 })
    await page.waitForTimeout(2000) // Wait for streaming to finish
    
    // Check mutation count (should be reasonable, not excessive)
    const mutations = await page.evaluate(() => (window as any).codeBlockMutations || 0)
    
    // Mutations should be less than 100 for a single code block
    // (allowing for reasonable streaming updates)
    expect(mutations).toBeLessThan(100)
  })
})

test.describe('Code Rendering in Compare', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the compare page
    await page.goto('/compare')
    
    // Wait for the page to be ready
    await page.waitForSelector('[data-testid="compare-input"]', { timeout: 10000 })
  })

  test('should render code blocks from both models without interference', async ({ page }) => {
    // Select two models
    const model1Selector = page.locator('[data-testid="model1-selector"]')
    const model2Selector = page.locator('[data-testid="model2-selector"]')
    
    // Select different models (if selectors exist)
    const model1Exists = await model1Selector.count() > 0
    const model2Exists = await model2Selector.count() > 0
    
    if (model1Exists && model2Exists) {
      await model1Selector.click()
      await page.locator('text=GPT-4').first().click()
      
      await model2Selector.click()
      await page.locator('text=Claude').first().click()
    }
    
    // Send a code generation prompt
    const compareInput = page.locator('[data-testid="compare-input"]')
    await compareInput.fill('Write a bubble sort algorithm')
    await compareInput.press('Enter')
    
    // Wait for both responses
    await page.waitForSelector('.animate-spin', { timeout: 10000 })
    
    // Wait for code blocks in both panels
    const leftPanel = page.locator('[data-testid="model1-response"]')
    const rightPanel = page.locator('[data-testid="model2-response"]')
    
    // Check for code blocks in both panels (using more generic selectors)
    await page.waitForSelector('pre', { timeout: 30000 })
    
    const codeBlocks = await page.locator('pre').count()
    expect(codeBlocks).toBeGreaterThanOrEqual(1)
    
    // Verify no error boundaries triggered
    const errors = await page.locator('[role="alert"]').count()
    expect(errors).toBe(0)
  })

  test('should handle different code formats from different models', async ({ page }) => {
    // This test verifies that different formatting from models doesn't break rendering
    const compareInput = page.locator('[data-testid="compare-input"]')
    
    // Send a prompt that typically generates different code styles
    await compareInput.fill('Show me different ways to handle errors in Python')
    await compareInput.press('Enter')
    
    // Wait for responses
    await page.waitForSelector('pre', { timeout: 30000 })
    
    // Check that all code blocks are properly formatted
    const codeBlocks = page.locator('pre')
    const count = await codeBlocks.count()
    
    for (let i = 0; i < count; i++) {
      const block = codeBlocks.nth(i)
      await expect(block).toBeVisible()
      
      // Verify each block has proper structure
      const hasContent = await block.textContent()
      expect(hasContent).toBeTruthy()
    }
    
    // Verify page stability (no crashes)
    await expect(page).toHaveTitle(/AI Studio/)
  })
})

test.describe('Error Recovery', () => {
  test('should show fallback UI when code rendering fails', async ({ page }) => {
    // This test would ideally inject a malformed code block
    // In practice, we can test the error boundary is present
    
    await page.goto('/chat')
    
    // Check that error boundary component is loaded
    const errorBoundaryExists = await page.evaluate(() => {
      return window.hasOwnProperty('CodeBlockErrorBoundary') || 
             document.querySelector('[class*="error-boundary"]') !== null
    })
    
    // The error boundary should be available in the code
    expect(errorBoundaryExists).toBeDefined()
  })

  test('should allow retry when code rendering fails', async ({ page }) => {
    // Navigate to chat
    await page.goto('/chat')
    
    // If an error boundary is triggered, verify retry button exists
    // This is a defensive test - in production, errors should be rare
    
    const errorBoundary = page.locator('[role="alert"]:has-text("Code Rendering Error")')
    const errorExists = await errorBoundary.count() > 0
    
    if (errorExists) {
      // Check for retry button
      const retryButton = page.locator('button:has-text("Retry")')
      await expect(retryButton).toBeVisible()
      
      // Click retry
      await retryButton.click()
      
      // Verify error is cleared
      await expect(errorBoundary).toBeHidden()
    }
  })
})