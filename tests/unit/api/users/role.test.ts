// Mock Request and Response before imports
class MockRequest {
  url: string;
  method: string;
  headers: Map<string, string>;
  body: string;

  constructor(url: string, init?: RequestInit) {
    this.url = url;
    this.method = init?.method || 'GET';
    this.headers = new Map(Object.entries(init?.headers || {}));
    this.body = init?.body as string;
  }

  json() {
    return Promise.resolve(JSON.parse(this.body));
  }
}

class MockHeaders {
  private headers: Map<string, string>;

  constructor(init?: HeadersInit) {
    this.headers = new Map();
    if (init) {
      Object.entries(init).forEach(([key, value]) => {
        this.headers.set(key.toLowerCase(), value);
      });
    }
  }

  get(name: string): string | null {
    return this.headers.get(name.toLowerCase()) || null;
  }
}

class MockResponse {
  status: number;
  body: any;

  constructor(body: any, init?: { status?: number }) {
    this.body = body;
    this.status = init?.status || 200;
  }

  json() {
    return Promise.resolve(this.body);
  }
}

global.Request = MockRequest as any;
global.Headers = MockHeaders as any;
global.Response = MockResponse as any;
global.NextResponse = {
  json: (data: any) => new MockResponse(data)
} as any;

import { db } from '../../../../lib/db';
import { POST } from '../../../../app/api/users/role/route';
import { auth } from '@clerk/nextjs';

// Mock auth
jest.mock('@clerk/nextjs', () => ({
  auth: jest.fn().mockReturnValue({ userId: 'admin-user' }),
}));

jest.mock('../../../../lib/db', () => ({
  db: {
    update: jest.fn().mockReturnValue({
      set: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([{ id: 1, role: 'Admin' }])
        })
      })
    }),
    query: {
      users: {
        findFirst: jest.fn().mockResolvedValue({ id: 1, role: 'Admin' })
      }
    }
  }
}));

describe('User Role API', () => {
  const mockUser = {
    id: 'test-user',
    clerkId: 'test-user',
    email: 'test@example.com',
    role: 'User'
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('updates user role successfully', async () => {
    (db.query.users.findFirst as jest.Mock).mockResolvedValueOnce(mockUser);

    const request = new Request('http://localhost/api/users/test-user/role', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-token'
      },
      body: JSON.stringify({ role: 'Admin', targetUserId: 'test-user' })
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    
    const body = await response.json();
    expect(body).toEqual({ id: 1, role: 'Admin' });
  });

  it('returns 400 for invalid request body', async () => {
    const request = new Request('http://localhost/api/users/test-user/role', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-token'
      },
      body: JSON.stringify({}) // missing role
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    
    const body = await response.json();
    expect(body).toBe('Invalid request');
  });

  it('returns 404 when user not found', async () => {
    (db.query.users.findFirst as jest.Mock)
      .mockResolvedValueOnce({ role: 'Admin' }) // First call for auth check
      .mockResolvedValueOnce(null); // Second call for target user

    const request = new Request('http://localhost/api/users/non-existent/role', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-token'
      },
      body: JSON.stringify({ role: 'Admin', targetUserId: 'non-existent' })
    });

    const response = await POST(request);
    expect(response.status).toBe(404);
    
    const body = await response.json();
    expect(body).toBe('User not found');
  });

  it('returns 500 for database errors', async () => {
    (db.query.users.findFirst as jest.Mock)
      .mockResolvedValueOnce({ role: 'Admin' }) // First call for auth check
      .mockRejectedValueOnce(new Error('Database error')); // Second call for target user

    const request = new Request('http://localhost/api/users/test-user/role', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-token'
      },
      body: JSON.stringify({ role: 'Admin', targetUserId: 'test-user' })
    });

    const response = await POST(request);
    expect(response.status).toBe(500);
    
    const body = await response.json();
    expect(body).toBe('Internal Server Error');
  });
}); 