import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';

// Mock Next.js server components first
jest.mock('next/server', () => ({
  NextRequest: jest.fn(),
  NextResponse: class NextResponse {
    body: string;
    status: number;
    headers: Map<string, string>;
    
    constructor(body: string, init?: { status?: number; headers?: Record<string, string> }) {
      this.body = body;
      this.status = init?.status || 200;
      this.headers = new Map(Object.entries(init?.headers || {}));
    }
    
    json() {
      return Promise.resolve(JSON.parse(this.body));
    }
    
    static json(data: unknown, init?: { status?: number; headers?: Record<string, string> }) {
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

import { POST as uploadAPI } from '@/app/api/documents/upload/route';
import { POST as chatAPI } from '@/app/api/chat/route';
import { POST as linkAPI } from '@/app/api/documents/link/route';
import { NextRequest } from 'next/server';

// Add TextEncoder/TextDecoder polyfills for Node.js test environment
import { TextEncoder, TextDecoder } from 'util';
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder as any;

// Mock all dependencies
jest.mock('@/lib/auth/server-session', () => ({
  getServerSession: jest.fn()
}));
jest.mock('@/actions/db/get-current-user-action');
jest.mock('@/lib/aws/s3-client');
jest.mock('@/lib/db/queries/documents');
jest.mock('@/lib/ai-helpers');
jest.mock('@/lib/db/data-api-adapter');

import { getServerSession } from '@/lib/auth/server-session';
import { getCurrentUserAction } from '@/actions/db/get-current-user-action';
import { uploadDocument } from '@/lib/aws/s3-client';
import { 
  saveDocument, 
  saveDocumentChunk, 
  getDocumentsByConversationId,
  getDocumentById,
  getDocumentChunksByDocumentId,
  linkDocumentToConversation 
} from '@/lib/db/queries/documents';
import { generateCompletion } from '@/lib/ai-helpers';
import { executeSQL } from '@/lib/db/data-api-adapter';

describe('Document Upload End-to-End Flow', () => {
  const mockUserId = 'user-123';
  const mockSession = { sub: mockUserId, email: 'test@example.com' };
  const mockUser = {
    isSuccess: true,
    data: { id: mockUserId, email: 'test@example.com' },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (getServerSession as jest.Mock).mockResolvedValue(mockSession);
    (getCurrentUserAction as jest.Mock).mockResolvedValue(mockUser);
  });

  describe('Complete Document Upload and Chat Flow', () => {
    it('should handle the complete flow: upload, create conversation, link document, and chat with context', async () => {
      // Step 1: Upload Document
      const mockFile = new File(['Test PDF content about AI and machine learning'], 'ai-guide.pdf', { 
        type: 'application/pdf' 
      });
      
      const mockUploadResult = {
        key: 'documents/user-123/12345-ai-guide.pdf',
        url: 'https://s3.amazonaws.com/bucket/documents/user-123/12345-ai-guide.pdf',
      };
      
      const mockDocument = {
        id: 'doc-456',
        name: 'ai-guide.pdf',
        type: 'pdf',
        s3_key: mockUploadResult.key,
        size: mockFile.size,
        user_id: mockUserId,
        conversation_id: null,
        metadata: { originalName: 'ai-guide.pdf', uploadedBy: mockUserId },
        created_at: new Date(),
        updated_at: new Date(),
      };
      
      const mockChunks = [
        { 
          id: 'chunk-1', 
          document_id: 'doc-456', 
          content: 'Test PDF content about AI and machine learning', 
          chunk_index: 0 
        },
      ];
      
      (uploadDocument as jest.Mock).mockResolvedValue(mockUploadResult);
      (saveDocument as jest.Mock).mockResolvedValue(mockDocument);
      (saveDocumentChunk as jest.Mock).mockResolvedValue(mockChunks[0]);
      
      // Create upload request
      const formData = new FormData();
      formData.append('file', mockFile);
      const uploadRequest = {
        formData: async () => formData,
      } as NextRequest;
      
      const uploadResponse = await uploadAPI(uploadRequest);
      const uploadData = await uploadResponse.json();
      
      expect(uploadResponse.status).toBe(200);
      expect(uploadData.success).toBe(true);
      expect(uploadData.document.id).toBe('doc-456');
      
      // Step 2: Start Chat with Document Context
      const chatMessages = [
        { role: 'user', content: 'What does this document say about AI?' }
      ];
      
      // Mock AI model lookup
      (executeSQL as jest.Mock).mockImplementation((query: string) => {
        if (query.includes('ai_models')) {
          return Promise.resolve([
            { id: 1, name: 'GPT-4', provider: 'openai', model_id: 'gpt-4' }
          ]);
        }
        if (query.includes('INSERT INTO conversations')) {
          return Promise.resolve([{ id: 789 }]);
        }
        if (query.includes('INSERT INTO messages')) {
          return Promise.resolve([]);
        }
        if (query.includes('SELECT role, content FROM messages')) {
          return Promise.resolve([
            { role: 'user', content: 'What does this document say about AI?' }
          ]);
        }
        return Promise.resolve([]);
      });
      
      // Mock document queries
      (getDocumentById as jest.Mock).mockResolvedValue(mockDocument);
      (getDocumentChunksByDocumentId as jest.Mock).mockResolvedValue(mockChunks);
      (generateCompletion as jest.Mock).mockResolvedValue(
        'Based on the document, AI refers to artificial intelligence and machine learning technologies.'
      );
      
      const chatRequest = {
        json: async () => ({
          messages: chatMessages,
          modelId: 'gpt-4',
          documentId: 'doc-456', // Include the uploaded document
        }),
      } as NextRequest;
      
      const chatResponse = await chatAPI(chatRequest);
      const chatData = await chatResponse.json();
      
      expect(chatResponse.status).toBe(200);
      expect(chatData.success).toBe(true);
      expect(chatData.data.conversationId).toBe(789);
      expect(chatData.data.text).toContain('AI refers to artificial intelligence');
      
      // Verify that document context was included in AI call
      expect(generateCompletion).toHaveBeenCalledWith(
        expect.any(Object),
        expect.arrayContaining([
          expect.objectContaining({
            role: 'system',
            content: expect.stringContaining('Test PDF content about AI and machine learning'),
          }),
        ])
      );
      
      // Step 3: Link Document to Conversation
      (linkDocumentToConversation as jest.Mock).mockResolvedValue({
        ...mockDocument,
        conversation_id: 789,
      });
      
      const linkRequest = {
        json: async () => ({
          documentId: 'doc-456',
          conversationId: 789,
        }),
      } as NextRequest;
      
      const linkResponse = await linkAPI(linkRequest);
      const linkData = await linkResponse.json();
      
      expect(linkResponse.status).toBe(200);
      expect(linkData.success).toBe(true);
      
      // Step 4: Continue Chat with Linked Document
      (getDocumentsByConversationId as jest.Mock).mockResolvedValue([mockDocument]);
      
      const followUpRequest = {
        json: async () => ({
          messages: [
            ...chatMessages,
            { role: 'assistant', content: 'Based on the document, AI refers to artificial intelligence and machine learning technologies.' },
            { role: 'user', content: 'Can you provide more details about machine learning?' }
          ],
          modelId: 'gpt-4',
          conversationId: 789,
        }),
      } as NextRequest;
      
      (generateCompletion as jest.Mock).mockResolvedValue(
        'The document mentions that machine learning is a subset of AI that enables systems to learn from data.'
      );
      
      const followUpResponse = await chatAPI(followUpRequest);
      const followUpData = await followUpResponse.json();
      
      expect(followUpResponse.status).toBe(200);
      expect(followUpData.data.text).toContain('machine learning is a subset of AI');
      
      // Verify document was fetched by conversation ID
      expect(getDocumentsByConversationId).toHaveBeenCalledWith({ conversationId: 789 });
    });

    it('should handle document upload with immediate chat (no conversation ID)', async () => {
      // Upload document
      const mockDocument = {
        id: 'doc-789',
        name: 'report.pdf',
        type: 'pdf',
        user_id: mockUserId,
      };
      
      (uploadDocument as jest.Mock).mockResolvedValue({ key: 'test-key', url: 'test-url' });
      (saveDocument as jest.Mock).mockResolvedValue(mockDocument);
      (saveDocumentChunk as jest.Mock).mockResolvedValue(
        { content: 'Financial report content', chunk_index: 0 }
      );
      
      const formData = new FormData();
      formData.append('file', new File(['Financial report'], 'report.pdf', { type: 'application/pdf' }));
      const uploadRequest = {
        formData: async () => formData,
      } as NextRequest;
      
      await uploadAPI(uploadRequest);
      
      // Start chat without conversation ID but with documentId
      (executeSQL as jest.Mock).mockImplementation((query: string) => {
        if (query.includes('ai_models')) {
          return Promise.resolve([
            { id: 1, name: 'GPT-4', provider: 'openai', model_id: 'gpt-4' }
          ]);
        }
        if (query.includes('INSERT INTO conversations')) {
          return Promise.resolve([{ id: 999 }]); // New conversation created
        }
        return Promise.resolve([]);
      });
      
      (getDocumentById as jest.Mock).mockResolvedValue(mockDocument);
      (getDocumentChunksByDocumentId as jest.Mock).mockResolvedValue([
        { content: 'Financial report content', chunk_index: 0 }
      ]);
      (generateCompletion as jest.Mock).mockResolvedValue('The financial report shows positive growth.');
      
      const chatRequest = {
        json: async () => ({
          messages: [{ role: 'user', content: 'Summarize this document' }],
          modelId: 'gpt-4',
          documentId: 'doc-789', // Document ID provided without conversation ID
        }),
      } as NextRequest;
      
      const chatResponse = await chatAPI(chatRequest);
      const chatData = await chatResponse.json();
      
      expect(chatResponse.status).toBe(200);
      expect(chatData.data.conversationId).toBe(999); // New conversation created
      expect(chatData.data.text).toContain('financial report shows positive growth');
      
      // Verify document was fetched even without initial conversation
      expect(getDocumentById).toHaveBeenCalledWith({ id: 'doc-789' });
    });

    it('should handle race conditions when linking documents', async () => {
      // Simulate multiple documents being uploaded and linked simultaneously
      const documents = [
        { id: 'doc-1', name: 'file1.pdf', user_id: mockUserId },
        { id: 'doc-2', name: 'file2.pdf', user_id: mockUserId },
      ];
      
      const linkPromises = documents.map(doc => {
        (linkDocumentToConversation as jest.Mock).mockResolvedValueOnce({
          ...doc,
          conversation_id: 123,
        });
        
        const request = {
          json: async () => ({
            documentId: doc.id,
            conversationId: 123,
          }),
        } as NextRequest;
        
        return linkAPI(request);
      });
      
      const responses = await Promise.all(linkPromises);
      
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });
      
      expect(linkDocumentToConversation).toHaveBeenCalledTimes(2);
    });

    it('should handle errors gracefully throughout the flow', async () => {
      // Test upload failure
      (uploadDocument as jest.Mock).mockRejectedValue(new Error('S3 failure'));
      
      const formData = new FormData();
      formData.append('file', new File(['test'], 'test.pdf', { type: 'application/pdf' }));
      const uploadRequest = {
        formData: async () => formData,
      } as NextRequest;
      
      const uploadResponse = await uploadAPI(uploadRequest);
      expect(uploadResponse.status).toBe(500);
      
      // Test chat with missing document
      (getDocumentById as jest.Mock).mockResolvedValue(null);
      (executeSQL as jest.Mock).mockResolvedValue([
        { id: 1, name: 'GPT-4', provider: 'openai', model_id: 'gpt-4' }
      ]);
      
      const chatRequest = {
        json: async () => ({
          messages: [{ role: 'user', content: 'Hello' }],
          modelId: 'gpt-4',
          documentId: 'non-existent',
        }),
      } as NextRequest;
      
      // Should still work without document
      (generateCompletion as jest.Mock).mockResolvedValue('Hello! How can I help you?');
      const chatResponse = await chatAPI(chatRequest);
      expect(chatResponse.status).toBe(200);
      
      // Test link failure with wrong user
      const wrongUserDoc = { id: 'doc-999', user_id: 'other-user' };
      (getDocumentById as jest.Mock).mockResolvedValue(wrongUserDoc);
      
      const linkRequest = {
        json: async () => ({
          documentId: 'doc-999',
          conversationId: 123,
        }),
      } as NextRequest;
      
      const linkResponse = await linkAPI(linkRequest);
      expect(linkResponse.status).toBe(403);
    });
  });

  describe('Document Context Retrieval', () => {
    it('should include relevant chunks based on user query', async () => {
      const mockChunks = [
        { content: 'Introduction to machine learning concepts', chunk_index: 0 },
        { content: 'Deep learning neural networks explained', chunk_index: 1 },
        { content: 'Natural language processing applications', chunk_index: 2 },
        { content: 'Computer vision and image recognition', chunk_index: 3 },
      ];
      
      (executeSQL as jest.Mock).mockResolvedValue([
        { id: 1, name: 'GPT-4', provider: 'openai', model_id: 'gpt-4' }
      ]);
      (getDocumentsByConversationId as jest.Mock).mockResolvedValue([
        { id: 'doc-123', name: 'ai-guide.pdf' }
      ]);
      (getDocumentChunksByDocumentId as jest.Mock).mockResolvedValue(mockChunks);
      (generateCompletion as jest.Mock).mockResolvedValue('Neural networks are explained in the document.');
      
      const chatRequest = {
        json: async () => ({
          messages: [{ role: 'user', content: 'Tell me about neural networks' }],
          modelId: 'gpt-4',
          conversationId: 123,
        }),
      } as NextRequest;
      
      await chatAPI(chatRequest);
      
      // Verify that relevant chunks were included in the context
      expect(generateCompletion).toHaveBeenCalledWith(
        expect.any(Object),
        expect.arrayContaining([
          expect.objectContaining({
            role: 'system',
            content: expect.stringContaining('Deep learning neural networks'),
          }),
        ])
      );
    });

    it('should handle general document queries', async () => {
      const mockChunks = [
        { content: 'Chapter 1: Introduction', chunk_index: 0 },
        { content: 'Chapter 2: Core Concepts', chunk_index: 1 },
        { content: 'Chapter 3: Advanced Topics', chunk_index: 2 },
      ];
      
      (executeSQL as jest.Mock).mockResolvedValue([
        { id: 1, name: 'GPT-4', provider: 'openai', model_id: 'gpt-4' }
      ]);
      (getDocumentsByConversationId as jest.Mock).mockResolvedValue([
        { id: 'doc-123', name: 'guide.pdf' }
      ]);
      (getDocumentChunksByDocumentId as jest.Mock).mockResolvedValue(mockChunks);
      (generateCompletion as jest.Mock).mockResolvedValue('This document contains 3 chapters covering various topics.');
      
      const chatRequest = {
        json: async () => ({
          messages: [{ role: 'user', content: 'What is this document about?' }],
          modelId: 'gpt-4',
          conversationId: 123,
        }),
      } as NextRequest;
      
      await chatAPI(chatRequest);
      
      // Should include multiple chunks for general queries
      const systemMessage = (generateCompletion as jest.Mock).mock.calls[0][1].find(
        (msg: any) => msg.role === 'system' && msg.content.includes('Chapter')
      );
      
      expect(systemMessage).toBeDefined();
      expect(systemMessage.content).toContain('Chapter 1');
      expect(systemMessage.content).toContain('Chapter 2');
    });
  });
});