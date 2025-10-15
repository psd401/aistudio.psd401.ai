/**
 * Jest configuration for CI environments
 * 
 * This config EXCLUDES performance tests which require:
 * - Running API server
 * - Authentication setup
 * - 30+ minutes execution time
 * 
 * Performance tests should run in separate scheduled jobs, not PR checks.
 */

const baseConfig = require('./jest.config.js');

module.exports = {
  ...baseConfig,
  testPathIgnorePatterns: [
    ...(baseConfig.testPathIgnorePatterns || []),
    '/tests/performance/',  // Exclude all performance tests
  ],
  displayName: 'ci-tests',
};
