import { POST } from '@/app/api/documents/upload/route';
import { uploadDocument } from '@/lib/aws/s3-client';
import { saveDocument, saveDocumentChunk, batchInsertDocumentChunks } from '@/lib/db/queries/documents';
import { getCurrentUserAction } from '@/actions/db/get-current-user-action';
import { getServerSession } from '@/lib/auth/server-session';
import { NextRequest } from 'next/server';

// Mock dependencies
jest.mock('@/lib/auth/server-session');
jest.mock('@/actions/db/get-current-user-action');
jest.mock('@/lib/aws/s3-client');
jest.mock('@/lib/db/queries/documents');
jest.mock('@/lib/logger', () => ({
  default: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

// Mock FormData and File
class MockFile extends Blob {
  name: string;
  lastModified: number;

  constructor(chunks: any[], filename: string, options?: any) {
    super(chunks, options);
    this.name = filename;
    this.lastModified = Date.now();
  }
}

global.File = MockFile as any;

describe('POST /api/documents/upload', () => {
  const mockUserId = 'user-123';
  const mockSession = { user: { id: mockUserId } };
  const mockUser = {
    isSuccess: true,
    data: { user: { id: mockUserId } },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (getServerSession as jest.Mock).mockResolvedValue(mockSession);
    (getCurrentUserAction as jest.Mock).mockResolvedValue(mockUser);
  });

  const createMockRequest = (formData: FormData): NextRequest => {
    return {
      formData: async () => formData,
    } as NextRequest;
  };

  describe('Authentication', () => {
    it('should return 401 if user is not authenticated', async () => {
      (getServerSession as jest.Mock).mockResolvedValue(null);
      
      const formData = new FormData();
      const request = createMockRequest(formData);
      
      const response = await POST(request);
      const data = await response.json();
      
      expect(response.status).toBe(401);
      expect(data.error).toBe('User not authenticated');
    });

    it('should return 401 if user is not found', async () => {
      (getCurrentUserAction as jest.Mock).mockResolvedValue({
        isSuccess: false,
      });
      
      const formData = new FormData();
      const request = createMockRequest(formData);
      
      const response = await POST(request);
      const data = await response.json();
      
      expect(response.status).toBe(401);
      expect(data.error).toBe('User not found');
    });
  });

  describe('File Validation', () => {
    it('should return 400 if no file is provided', async () => {
      const formData = new FormData();
      const request = createMockRequest(formData);
      
      const response = await POST(request);
      const data = await response.json();
      
      expect(response.status).toBe(400);
      expect(data.error).toBe('No file provided');
    });

    it('should reject files over 10MB', async () => {
      const largeContent = new Array(11 * 1024 * 1024).fill('a').join('');
      const file = new MockFile([largeContent], 'large.pdf', { type: 'application/pdf' });
      
      const formData = new FormData();
      formData.append('file', file);
      const request = createMockRequest(formData);
      
      const response = await POST(request);
      const data = await response.json();
      
      expect(response.status).toBe(400);
      expect(data.error).toBe('File size exceeds 10MB limit');
    });

    it('should reject invalid file types', async () => {
      const file = new MockFile(['test content'], 'test.exe', { type: 'application/exe' });
      
      const formData = new FormData();
      formData.append('file', file);
      const request = createMockRequest(formData);
      
      const response = await POST(request);
      const data = await response.json();
      
      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid file type. Allowed types: pdf, docx, txt');
    });
  });

  describe('Successful Upload', () => {
    it('should successfully upload a PDF file', async () => {
      const file = new MockFile(['PDF content'], 'test.pdf', { type: 'application/pdf' });
      const formData = new FormData();
      formData.append('file', file);
      const request = createMockRequest(formData);
      
      const mockUploadResult = {
        key: 'documents/user-123/test-123.pdf',
        url: 'https://s3.amazonaws.com/bucket/documents/user-123/test-123.pdf',
      };
      
      const mockDocument = {
        id: 'doc-123',
        name: 'test.pdf',
        type: 'pdf',
        url: mockUploadResult.key,
        size: 11,
        user_id: mockUserId,
        conversation_id: null,
        metadata: { originalName: 'test.pdf', uploadedBy: mockUserId },
        created_at: new Date(),
        updated_at: new Date(),
      };
      
      const mockChunks = [
        { id: 'chunk-1', document_id: 'doc-123', content: 'PDF content', chunk_index: 0 },
      ];
      
      (uploadDocument as jest.Mock).mockResolvedValue(mockUploadResult);
      (saveDocument as jest.Mock).mockResolvedValue(mockDocument);
      (batchInsertDocumentChunks as jest.Mock).mockResolvedValue(mockChunks);
      
      const response = await POST(request);
      const data = await response.json();
      
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.document).toEqual({
        id: 'doc-123',
        name: 'test.pdf',
        type: 'pdf',
        url: expect.stringContaining('/api/documents/download?id=doc-123'),
        size: 11,
        createdAt: expect.any(String),
      });
      
      // Verify S3 upload was called
      expect(uploadDocument).toHaveBeenCalledWith({
        userId: mockUserId,
        fileName: 'test-123.pdf',
        fileContent: expect.any(Buffer),
        contentType: 'application/pdf',
        metadata: {
          originalName: 'test.pdf',
          uploadedBy: mockUserId,
        },
      });
      
      // Verify document was created in database
      expect(saveDocument).toHaveBeenCalledWith({
        name: 'test.pdf',
        type: 'pdf',
        url: mockUploadResult.key,
        size: 11,
        userId: mockUserId,
        conversationId: null,
        metadata: {
          originalName: 'test.pdf',
          uploadedBy: mockUserId,
        },
      });
      
      // Verify chunks were created
      expect(batchInsertDocumentChunks).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            documentId: 'doc-123',
            content: 'PDF content',
            chunkIndex: 0,
          }),
        ])
      );
    });

    it('should handle text extraction from different file types', async () => {
      const testCases = [
        { 
          filename: 'test.txt', 
          type: 'text/plain', 
          content: 'Plain text content',
          expectedChunks: ['Plain text content'],
        },
        { 
          filename: 'test.docx', 
          type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          content: 'DOCX content',
          expectedChunks: ['DOCX content'], // Simplified for test
        },
      ];
      
      for (const testCase of testCases) {
        jest.clearAllMocks();
        
        const file = new MockFile([testCase.content], testCase.filename, { type: testCase.type });
        const formData = new FormData();
        formData.append('file', file);
        const request = createMockRequest(formData);
        
        const mockUploadResult = {
          key: `documents/user-123/${testCase.filename}`,
          url: `https://s3.amazonaws.com/bucket/documents/user-123/${testCase.filename}`,
        };
        
        const mockDocument = {
          id: 'doc-123',
          name: testCase.filename,
          type: testCase.filename.split('.').pop(),
          url: mockUploadResult.key,
          size: testCase.content.length,
          user_id: mockUserId,
        };
        
        (uploadDocument as jest.Mock).mockResolvedValue(mockUploadResult);
        (saveDocument as jest.Mock).mockResolvedValue(mockDocument);
        (batchInsertDocumentChunks as jest.Mock).mockResolvedValue([]);
        
        const response = await POST(request);
        const data = await response.json();
        
        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.document.name).toBe(testCase.filename);
      }
    });

    it('should chunk large documents', async () => {
      // Create content larger than chunk size (1000 chars)
      const largeContent = 'a'.repeat(2500); // 2500 characters
      const file = new MockFile([largeContent], 'large.txt', { type: 'text/plain' });
      const formData = new FormData();
      formData.append('file', file);
      const request = createMockRequest(formData);
      
      const mockUploadResult = {
        key: 'documents/user-123/large-123.txt',
        url: 'https://s3.amazonaws.com/bucket/documents/user-123/large-123.txt',
      };
      
      const mockDocument = {
        id: 'doc-123',
        name: 'large.txt',
        type: 'txt',
        url: mockUploadResult.key,
        size: 2500,
        user_id: mockUserId,
      };
      
      (uploadDocument as jest.Mock).mockResolvedValue(mockUploadResult);
      (saveDocument as jest.Mock).mockResolvedValue(mockDocument);
      (batchInsertDocumentChunks as jest.Mock).mockResolvedValue([]);
      
      const response = await POST(request);
      const data = await response.json();
      
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      
      // Verify chunks were created (should be 3 chunks for 2500 chars with 1000 char chunks)
      expect(batchInsertDocumentChunks).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ documentId: 'doc-123', chunkIndex: 0 }),
          expect.objectContaining({ documentId: 'doc-123', chunkIndex: 1 }),
          expect.objectContaining({ documentId: 'doc-123', chunkIndex: 2 }),
        ])
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle S3 upload errors', async () => {
      const file = new MockFile(['test content'], 'test.pdf', { type: 'application/pdf' });
      const formData = new FormData();
      formData.append('file', file);
      const request = createMockRequest(formData);
      
      (uploadDocument as jest.Mock).mockRejectedValue(new Error('S3 upload failed'));
      
      const response = await POST(request);
      const data = await response.json();
      
      expect(response.status).toBe(500);
      expect(data.error).toContain('Failed to upload file');
    });

    it('should handle database errors', async () => {
      const file = new MockFile(['test content'], 'test.pdf', { type: 'application/pdf' });
      const formData = new FormData();
      formData.append('file', file);
      const request = createMockRequest(formData);
      
      const mockUploadResult = {
        key: 'documents/user-123/test-123.pdf',
        url: 'https://s3.amazonaws.com/bucket/documents/user-123/test-123.pdf',
      };
      
      (uploadDocument as jest.Mock).mockResolvedValue(mockUploadResult);
      (saveDocument as jest.Mock).mockRejectedValue(new Error('Database error'));
      
      const response = await POST(request);
      const data = await response.json();
      
      expect(response.status).toBe(500);
      expect(data.error).toContain('Failed to save document');
    });

    it('should handle text extraction errors gracefully', async () => {
      const file = new MockFile(['corrupted content'], 'test.pdf', { type: 'application/pdf' });
      const formData = new FormData();
      formData.append('file', file);
      const request = createMockRequest(formData);
      
      const mockUploadResult = {
        key: 'documents/user-123/test-123.pdf',
        url: 'https://s3.amazonaws.com/bucket/documents/user-123/test-123.pdf',
      };
      
      const mockDocument = {
        id: 'doc-123',
        name: 'test.pdf',
        type: 'pdf',
        url: mockUploadResult.key,
        size: 17,
        user_id: mockUserId,
      };
      
      (uploadDocument as jest.Mock).mockResolvedValue(mockUploadResult);
      (saveDocument as jest.Mock).mockResolvedValue(mockDocument);
      // Mock text extraction failure - should still save document without chunks
      (batchInsertDocumentChunks as jest.Mock).mockResolvedValue([]);
      
      const response = await POST(request);
      const data = await response.json();
      
      // Should still succeed even if text extraction fails
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.document.id).toBe('doc-123');
    });
  });

  describe('Filename Sanitization', () => {
    it('should sanitize filenames with special characters', async () => {
      const testCases = [
        { input: 'test file.pdf', expected: 'test-file' },
        { input: 'test@#$%.pdf', expected: 'test' },
        { input: 'test___file.pdf', expected: 'test-file' },
        { input: '../../etc/passwd.pdf', expected: 'etc-passwd' },
      ];
      
      for (const testCase of testCases) {
        jest.clearAllMocks();
        
        const file = new MockFile(['test content'], testCase.input, { type: 'application/pdf' });
        const formData = new FormData();
        formData.append('file', file);
        const request = createMockRequest(formData);
        
        const mockDocument = {
          id: 'doc-123',
          name: testCase.input,
          type: 'pdf',
        };
        
        (uploadDocument as jest.Mock).mockResolvedValue({ key: 'test', url: 'test' });
        (saveDocument as jest.Mock).mockResolvedValue(mockDocument);
        (batchInsertDocumentChunks as jest.Mock).mockResolvedValue([]);
        
        await POST(request);
        
        expect(uploadDocument).toHaveBeenCalledWith(
          expect.objectContaining({
            fileName: expect.stringContaining(testCase.expected),
          })
        );
      }
    });
  });
});