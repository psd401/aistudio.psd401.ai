import '@testing-library/jest-dom';

// Mock auth factory
jest.mock('@/auth', () => ({
  createAuth: jest.fn(() => ({
    auth: jest.fn().mockResolvedValue({
      user: {
        id: 'test-cognito-sub',
        email: 'test@example.com'
      }
    }),
    signIn: jest.fn(),
    signOut: jest.fn()
  })),
  authMiddleware: jest.fn(),
  createAuthHandlers: jest.fn(() => ({
    GET: jest.fn(),
    POST: jest.fn()
  }))
}));

// Mock request context
jest.mock('@/lib/auth/request-context', () => ({
  createRequestContext: () => Promise.resolve({
    requestId: 'test-request-id'
  })
}));

// Mock AWS Cognito authentication
jest.mock('@/lib/auth/server-session', () => ({
  getServerSession: jest.fn(() => Promise.resolve({ 
    sub: 'test-cognito-sub',
    email: 'test@example.com'
  }))
}));

jest.mock('aws-amplify', () => ({
  Amplify: {
    configure: jest.fn()
  }
}));

// Mock logger
jest.mock('@/lib/logger', () => ({
  __esModule: true,
  default: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

// Mock ResizeObserver
class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

global.ResizeObserver = ResizeObserver;

// Add TextEncoder/TextDecoder for Node environment
if (typeof global.TextEncoder === 'undefined') {
  const { TextEncoder, TextDecoder } = require('util');
  global.TextEncoder = TextEncoder;
  global.TextDecoder = TextDecoder;
}

// Mock Next.js server components
jest.mock('next/server', () => ({
  NextRequest: jest.fn(),
  NextResponse: class NextResponse {
    constructor(body, init) {
      this.body = body;
      this.status = init?.status || 200;
      this.headers = new Map(Object.entries(init?.headers || {}));
    }
    
    json() {
      return Promise.resolve(JSON.parse(this.body));
    }
    
    static json(data, init) {
      return new NextResponse(JSON.stringify(data), {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          ...(init?.headers || {})
        }
      });
    }
  }
})); 