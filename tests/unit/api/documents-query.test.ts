import { NextRequest } from 'next/server';
import { POST } from '@/app/api/documents/query/route';
import { getServerSession } from '@/lib/auth/server-session';
import { getCurrentUserAction } from '@/actions/db/get-current-user-action';
import { getDocumentsByConversationId, getDocumentChunksByDocumentId } from '@/lib/db/queries/documents';

// Mock dependencies
jest.mock('@/lib/auth/server-session', () => ({
  getServerSession: jest.fn()
}));
jest.mock('@/actions/db/get-current-user-action');
jest.mock('@/lib/db/queries/documents');
jest.mock('@/lib/logger', () => ({
  default: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

// TODO: Fix test setup - mocking approach needs to be updated to match test environment
// The tests below are comprehensive but currently fail due to mock setup issues
// that also affect existing tests in the codebase (e.g., documents-upload.test.ts)

describe('POST /api/documents/query', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Authentication and Authorization', () => {
    it('should return 401 if no session', async () => {
      (getServerSession as jest.Mock).mockResolvedValue(null);

      const request = new NextRequest('http://localhost:3000/api/documents/query', {
        method: 'POST',
        body: JSON.stringify({ conversationId: 1, query: 'test' }),
      });

      const response = await POST(request);
      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe('Unauthorized');
    });

    it('should return 401 if user not found', async () => {
      (getServerSession as jest.Mock).mockResolvedValue({ user: { sub: 'test-sub' } } as any);
      (getCurrentUserAction as jest.Mock).mockResolvedValue({ isSuccess: false, message: 'User not found' });

      const request = new NextRequest('http://localhost:3000/api/documents/query', {
        method: 'POST',
        body: JSON.stringify({ conversationId: 1, query: 'test' }),
      });

      const response = await POST(request);
      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe('User not found');
    });
  });

  describe('Input Validation', () => {
    beforeEach(() => {
      (getServerSession as jest.Mock).mockResolvedValue({ user: { sub: 'test-sub' } } as any);
      (getCurrentUserAction as jest.Mock).mockResolvedValue({
        isSuccess: true,
        data: { user: { id: BigInt(1) } }
      } as any);
    });

    it('should return 400 if conversationId is missing', async () => {
      const request = new NextRequest('http://localhost:3000/api/documents/query', {
        method: 'POST',
        body: JSON.stringify({ query: 'test' }),
      });

      const response = await POST(request);
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Conversation ID is required');
    });

    it('should return 400 if query is missing', async () => {
      const request = new NextRequest('http://localhost:3000/api/documents/query', {
        method: 'POST',
        body: JSON.stringify({ conversationId: 1 }),
      });

      const response = await POST(request);
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Query is required and must be a string');
    });

    it('should return 400 if query is not a string', async () => {
      const request = new NextRequest('http://localhost:3000/api/documents/query', {
        method: 'POST',
        body: JSON.stringify({ conversationId: 1, query: 123 }),
      });

      const response = await POST(request);
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Query is required and must be a string');
    });

    it('should return 400 if query is too long', async () => {
      const longQuery = 'a'.repeat(1001);
      const request = new NextRequest('http://localhost:3000/api/documents/query', {
        method: 'POST',
        body: JSON.stringify({ conversationId: 1, query: longQuery }),
      });

      const response = await POST(request);
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Query is too long (max 1000 characters)');
    });
  });

  describe('Regex Injection Protection', () => {
    beforeEach(() => {
      (getServerSession as jest.Mock).mockResolvedValue({ user: { sub: 'test-sub' } } as any);
      (getCurrentUserAction as jest.Mock).mockResolvedValue({
        isSuccess: true,
        data: { user: { id: BigInt(1) } }
      } as any);
      (getDocumentsByConversationId as jest.Mock).mockResolvedValue([
        { id: BigInt(1), name: 'Test Doc', conversationId: BigInt(1) }
      ] as any);
      (getDocumentChunksByDocumentId as jest.Mock).mockResolvedValue([
        { 
          id: BigInt(1), 
          documentId: BigInt(1), 
          chunkIndex: 0, 
          content: 'This is a test document with special characters: .*+?^${}()|[]\\' 
        }
      ] as any);
    });

    it('should handle regex special characters safely', async () => {
      const maliciousQueries = [
        '.*',
        '.+',
        '[a-z]+',
        '(test)',
        'test|other',
        '^test$',
        'test{2,3}',
        'test?',
        'test*',
        'test\\d',
        'test[123]',
        'test(group)',
        'test$'
      ];

      for (const query of maliciousQueries) {
        const request = new NextRequest('http://localhost:3000/api/documents/query', {
          method: 'POST',
          body: JSON.stringify({ conversationId: 1, query }),
        });

        const response = await POST(request);
        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.success).toBe(true);
        // Should not throw regex errors
      }
    });

    it('should correctly match escaped special characters', async () => {
      (getDocumentChunksByDocumentId as jest.Mock).mockResolvedValue([
        { 
          id: BigInt(1), 
          documentId: BigInt(1), 
          chunkIndex: 0, 
          content: 'This document contains a literal .* pattern' 
        },
        { 
          id: BigInt(2), 
          documentId: BigInt(1), 
          chunkIndex: 1, 
          content: 'This document does not contain the pattern' 
        }
      ] as any);

      const request = new NextRequest('http://localhost:3000/api/documents/query', {
        method: 'POST',
        body: JSON.stringify({ conversationId: 1, query: '.*' }),
      });

      const response = await POST(request);
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.results).toHaveLength(1);
      expect(data.results[0].content).toContain('literal .* pattern');
    });
  });

  describe('Search Functionality', () => {
    beforeEach(() => {
      (getServerSession as jest.Mock).mockResolvedValue({ user: { sub: 'test-sub' } } as any);
      (getCurrentUserAction as jest.Mock).mockResolvedValue({
        isSuccess: true,
        data: { user: { id: BigInt(1) } }
      } as any);
      (getDocumentsByConversationId as jest.Mock).mockResolvedValue([
        { id: BigInt(1), name: 'Test Doc 1', conversationId: BigInt(1) },
        { id: BigInt(2), name: 'Test Doc 2', conversationId: BigInt(1) }
      ] as any);
    });

    it('should return empty results when no documents found', async () => {
      (getDocumentsByConversationId as jest.Mock).mockResolvedValue([]);

      const request = new NextRequest('http://localhost:3000/api/documents/query', {
        method: 'POST',
        body: JSON.stringify({ conversationId: 1, query: 'test' }),
      });

      const response = await POST(request);
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.results).toEqual([]);
      expect(data.message).toBe('No documents found for this conversation');
    });

    it('should search case-insensitively', async () => {
      (getDocumentChunksByDocumentId as jest.Mock).mockResolvedValue([
        { 
          id: BigInt(1), 
          documentId: BigInt(1), 
          chunkIndex: 0, 
          content: 'This is a TEST document' 
        }
      ] as any);

      const request = new NextRequest('http://localhost:3000/api/documents/query', {
        method: 'POST',
        body: JSON.stringify({ conversationId: 1, query: 'test' }),
      });

      const response = await POST(request);
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.results).toHaveLength(1);
    });

    it('should calculate relevance based on occurrence count', async () => {
      (getDocumentChunksByDocumentId as jest.Mock)
        .mockResolvedValueOnce([
          { 
            id: BigInt(1), 
            documentId: BigInt(1), 
            chunkIndex: 0, 
            content: 'test test test' // 3 occurrences
          }
        ] as any)
        .mockResolvedValueOnce([
          { 
            id: BigInt(2), 
            documentId: BigInt(2), 
            chunkIndex: 0, 
            content: 'test' // 1 occurrence
          }
        ] as any);

      const request = new NextRequest('http://localhost:3000/api/documents/query', {
        method: 'POST',
        body: JSON.stringify({ conversationId: 1, query: 'test' }),
      });

      const response = await POST(request);
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.results).toHaveLength(2);
      expect(data.results[0].relevance).toBe(3);
      expect(data.results[1].relevance).toBe(1);
    });

    it('should limit results to top 5', async () => {
      const chunks = Array.from({ length: 10 }, (_, i) => ({
        id: BigInt(i),
        documentId: BigInt(1),
        chunkIndex: i,
        content: `Document chunk ${i} contains test`
      }));
      (getDocumentChunksByDocumentId as jest.Mock).mockResolvedValue(chunks as any);

      const request = new NextRequest('http://localhost:3000/api/documents/query', {
        method: 'POST',
        body: JSON.stringify({ conversationId: 1, query: 'test' }),
      });

      const response = await POST(request);
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.results).toHaveLength(5);
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      (getServerSession as jest.Mock).mockResolvedValue({ user: { sub: 'test-sub' } } as any);
      (getCurrentUserAction as jest.Mock).mockResolvedValue({
        isSuccess: true,
        data: { user: { id: BigInt(1) } }
      } as any);
    });

    it('should handle database errors gracefully', async () => {
      (getDocumentsByConversationId as jest.Mock).mockRejectedValue(new Error('Database connection failed'));

      const request = new NextRequest('http://localhost:3000/api/documents/query', {
        method: 'POST',
        body: JSON.stringify({ conversationId: 1, query: 'test' }),
      });

      const response = await POST(request);
      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error).toBe('Database connection failed');
    });

    it('should handle invalid JSON gracefully', async () => {
      const request = new NextRequest('http://localhost:3000/api/documents/query', {
        method: 'POST',
        body: 'invalid json',
      });

      const response = await POST(request);
      expect(response.status).toBe(500);
    });
  });
});