const nextJest = require('next/jest');

const createJestConfig = nextJest({
  dir: './',
});

const customJestConfig = {
  setupFilesAfterEnv: [
    '<rootDir>/jest.setup.js',
    '<rootDir>/tests/setup.ts'
  ],
  testEnvironment: 'jest-environment-jsdom',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    'lucide-react': '<rootDir>/tests/mocks/lucide-react.js'
  },
  setupFiles: ['<rootDir>/.jest/setEnvVars.js'],
  transformIgnorePatterns: [
    'node_modules/(?!(lucide-react)/)'
  ]
};

module.exports = createJestConfig(customJestConfig); 