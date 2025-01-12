import '@testing-library/jest-dom';

// Mock Clerk
jest.mock('@clerk/nextjs', () => ({
  auth: () => Promise.resolve({ userId: 'test-user' }),
  currentUser: () => Promise.resolve({ id: 'test-user', firstName: 'Test', lastName: 'User' }),
  useUser: () => ({ isSignedIn: true, user: { id: 'test-user', firstName: 'Test', lastName: 'User' } }),
  UserButton: () => null
}));

// Mock ResizeObserver
class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

global.ResizeObserver = ResizeObserver; 