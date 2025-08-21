import { defineConfig, devices } from '@playwright/test';

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// import dotenv from 'dotenv';
// import path from 'path';
// dotenv.config({ path: path.resolve(__dirname, '.env.test.local') });

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
  retries: process.env.CI ? 1 : 0, // Reduced from 2 to 1 for faster CI
  /* Use multiple workers even in CI for better performance */
  workers: process.env.CI ? 4 : undefined, // Increased from 1 to 4 workers in CI
  
  /* Global test timeout - kill any test that runs longer than 30 seconds */
  timeout: 30 * 1000,
  
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

    /* Video only on failure in CI to reduce storage */
    video: process.env.CI ? 'retain-on-failure' : 'off',
    
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
        // Use faster channel for CI
        channel: 'chrome',
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

    /* Test against mobile viewports. */
    // {
    //   name: 'Mobile Chrome',
    //   use: { ...devices['Pixel 5'] },
    // },
    // {
    //   name: 'Mobile Safari',
    //   use: { ...devices['iPhone 12'] },
    // },

    /* Test against branded browsers. */
    // {
    //   name: 'Microsoft Edge',
    //   use: { ...devices['Desktop Edge'], channel: 'msedge' },
    // },
    // {
    //   name: 'Google Chrome',
    //   use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    // },
  ],

  /* Run your local dev server before starting the tests */
  webServer: process.env.CI
    ? undefined
    : {
        command: 'npm run dev',
        port: 3000,
        reuseExistingServer: true,
        timeout: 60 * 1000, // Reduced from 120s to 60s
      },
});