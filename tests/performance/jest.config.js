/**
 * Jest configuration for performance tests
 * 
 * Performance tests are skipped in CI by default to prevent hanging.
 * To run in CI: set RUN_PERFORMANCE_TESTS=true
 */

module.exports = {
  displayName: 'performance-tests',
  testMatch: ['**/tests/performance/**/*.test.ts'],
  testTimeout: 600000, // 10 minutes
  maxWorkers: 1, // Run tests serially to avoid overwhelming the server
  
  // Show clear message when tests are skipped
  verbose: true,
};
