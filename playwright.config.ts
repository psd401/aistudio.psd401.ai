import { defineConfig, devices } from '@playwright/test';

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './tests/e2e',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 1 : 0,
  /* Reduce workers in CI to avoid resource contention */
  workers: process.env.CI ? 2 : undefined,
  
  /* Global test timeout - kill any test that runs longer than 10 seconds in CI */
  timeout: process.env.CI ? 10 * 1000 : 30 * 1000,
  
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: process.env.CI ? [
    ['html'],
    ['list'],
    ['github'],
    ['json', { outputFile: 'test-results.json' }]
  ] : [
    ['html'],
    ['list'],
    ['dot']
  ],
  
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',

    /* Collect trace only on retry failures to save time */
    trace: process.env.CI ? 'retain-on-failure' : 'on-first-retry',

    /* Take screenshot on failure only to save time */
    screenshot: 'only-on-failure',

    /* Disable video in CI to avoid ffmpeg issues */
    video: process.env.CI ? 'off' : 'retain-on-failure',
    
    /* Use headless mode in CI for better performance */
    headless: process.env.CI ? true : false,
    
    /* Reduce viewport calculations */
    viewport: { width: 1280, height: 720 },
    
    /* Ignore HTTPS errors for faster testing */
    ignoreHTTPSErrors: true,
    
    /* Set action timeout */
    actionTimeout: 10 * 1000,
    
    /* Set navigation timeout */
    navigationTimeout: 15 * 1000,
  },

  /* Expect timeout - fail assertions that take longer than 5 seconds */
  expect: {
    timeout: 5 * 1000
  },

  /* Configure projects for major browsers - optimize for CI */
  projects: process.env.CI ? [
    // In CI, only test Chromium for speed
    {
      name: 'chromium',
      use: { 
        ...devices['Desktop Chrome'],
        // Remove channel setting that might cause issues
      },
    },
  ] : [
    // In local dev, test multiple browsers
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },

    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },

    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],

  /* Run your local dev server before starting the tests */
  webServer: process.env.CI
    ? undefined
    : {
        command: 'npm run dev',
        port: 3000,
        reuseExistingServer: true,
        timeout: 60 * 1000,
      },
});