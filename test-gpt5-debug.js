// Debug script to test GPT-5 streaming and capture error details
const playwright = require('playwright');

async function testGPT5Streaming() {
  const browser = await playwright.chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  // Enable request/response logging
  page.on('request', request => {
    if (request.url().includes('/api/chat')) {
      console.log('>>> Chat API Request:', {
        url: request.url(),
        method: request.method(),
        headers: request.headers(),
        postData: request.postData()
      });
    }
  });
  
  page.on('response', response => {
    if (response.url().includes('/api/chat')) {
      console.log('<<< Chat API Response:', {
        url: response.url(),
        status: response.status(),
        statusText: response.statusText(),
        headers: response.headers()
      });
      
      // Try to get response body if it's an error
      if (response.status() >= 400) {
        response.text().then(body => {
          console.log('Error Response Body:', body);
        }).catch(e => console.log('Could not get error body:', e));
      }
    }
  });
  
  // Log console messages
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('Browser Console Error:', msg.text());
    }
  });
  
  try {
    // Navigate to the app
    console.log('Navigating to app...');
    await page.goto('http://localhost:3000');
    
    // Wait for auth redirect
    await page.waitForURL(/\/auth\/signin/, { timeout: 10000 }).catch(() => {});
    
    // Login
    console.log('Logging in...');
    await page.fill('input[name="email"]', 'hagel.k@psd401.net');
    await page.fill('input[name="password"]', 'Vision2025!');
    await page.click('button[type="submit"]');
    
    // Wait for chat page
    await page.waitForURL(/\/chat/, { timeout: 10000 });
    console.log('On chat page');
    
    // Wait for the page to fully load
    await page.waitForTimeout(2000);
    
    // Select GPT-5 model if available
    const modelSelector = await page.$('[data-testid="model-selector"], select[name="model"], button:has-text("Model")');
    if (modelSelector) {
      await modelSelector.click();
      await page.waitForTimeout(500);
      const gpt5Option = await page.$('text=/gpt-5/i, [data-value*="gpt-5"]');
      if (gpt5Option) {
        await gpt5Option.click();
        console.log('Selected GPT-5 model');
      }
    }
    
    // Type a complex question
    const complexQuestion = "Explain the mathematical foundations of transformer neural networks, including the attention mechanism formula, and how positional encodings work. Then provide a simple Python implementation of a basic attention layer.";
    
    console.log('Typing question...');
    const textarea = await page.$('textarea[placeholder*="Message"], textarea[placeholder*="Type"], textarea[placeholder*="Ask"], textarea');
    if (!textarea) {
      throw new Error('Could not find message textarea');
    }
    
    await textarea.fill(complexQuestion);
    
    // Take screenshot before sending
    await page.screenshot({ path: 'before-send.png' });
    
    // Send the message
    console.log('Sending message...');
    await page.keyboard.press('Enter');
    
    // Take screenshots to capture UI state
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'after-send-immediate.png' });
    
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'after-send-2s.png' });
    
    // Wait for response or error
    await page.waitForTimeout(5000);
    await page.screenshot({ path: 'after-send-5s.png' });
    
    // Check if there's an error message
    const errorElement = await page.$('text=/error/i, text=/failed/i, [class*="error"]');
    if (errorElement) {
      const errorText = await errorElement.textContent();
      console.log('Error found on page:', errorText);
    }
    
    // Check if messages are visible
    const messages = await page.$$('[class*="message"], [data-testid*="message"]');
    console.log('Number of messages visible:', messages.length);
    
  } catch (error) {
    console.error('Test error:', error);
    await page.screenshot({ path: 'error-state.png' });
  }
  
  // Keep browser open for inspection
  console.log('Test complete. Browser will remain open for 30 seconds...');
  await page.waitForTimeout(30000);
  
  await browser.close();
}

testGPT5Streaming().catch(console.error);