import '@testing-library/jest-dom';

// Mock AWS Cognito authentication
jest.mock('@/lib/auth/server-session', () => ({
  getServerSession: () => Promise.resolve({ 
    sub: 'test-cognito-sub',
    email: 'test@example.com'
  })
}));

jest.mock('aws-amplify', () => ({
  Amplify: {
    configure: jest.fn()
  }
}));

// Mock ResizeObserver
class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

global.ResizeObserver = ResizeObserver; 