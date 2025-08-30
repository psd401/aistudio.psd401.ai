import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { NextRequest } from 'next/server';
import { POST as initiateUpload } from '@/app/api/documents/v2/initiate-upload/route';
import { GET as getJobStatus } from '@/app/api/documents/v2/jobs/[jobId]/route';
import { POST as confirmUpload } from '@/app/api/documents/v2/confirm-upload/route';

// Mock dependencies
jest.mock('@/lib/auth/server-session');
jest.mock('@/lib/services/document-job-service');
jest.mock('@/lib/aws/document-upload');
jest.mock('@/lib/aws/lambda-trigger');

const originalEnv = process.env;

beforeEach(() => {
  process.env = {
    ...originalEnv,
    DOCUMENT_JOBS_TABLE: 'test-table',
    DOCUMENTS_BUCKET_NAME: 'test-bucket',
  };
});

afterEach(() => {
  process.env = originalEnv;
  jest.clearAllMocks();
});

describe('Documents v2 API Routes', () => {
  const mockSession = {
    userId: 'user-123',
    user: { id: 'user-123', email: 'test@example.com' },
  };

  describe('POST /api/documents/v2/initiate-upload', () => {
    it('should successfully initiate upload for valid request', async () => {
      const { getServerSession } = require('@/lib/auth/server-session');
      const { createDocumentJob } = require('@/lib/services/document-job-service');
      const { generatePresignedUrl } = require('@/lib/aws/document-upload');

      getServerSession.mockResolvedValue(mockSession);
      createDocumentJob.mockResolvedValue({ id: 'job-123' });
      generatePresignedUrl.mockResolvedValue({
        uploadId: 'job-123',
        url: 'https://presigned-url.com',
        method: 'single',
      });

      const request = new NextRequest('http://localhost:3000/api/documents/v2/initiate-upload', {
        method: 'POST',
        body: JSON.stringify({
          fileName: 'test.pdf',
          fileSize: 1024 * 1024, // 1MB
          fileType: 'application/pdf',
          purpose: 'chat',
          processingOptions: {
            extractText: true,
            convertToMarkdown: false,
            extractImages: false,
            generateEmbeddings: false,
            ocrEnabled: true,
          },
        }),
      });

      const response = await initiateUpload(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.jobId).toBe('job-123');
      expect(data.uploadUrl).toBe('https://presigned-url.com');
      expect(data.uploadMethod).toBe('single');
    });

    it('should return 401 for unauthenticated request', async () => {
      const { getServerSession } = require('@/lib/auth/server-session');
      getServerSession.mockResolvedValue(null);

      const request = new NextRequest('http://localhost:3000/api/documents/v2/initiate-upload', {
        method: 'POST',
        body: JSON.stringify({
          fileName: 'test.pdf',
          fileSize: 1024 * 1024,
          fileType: 'application/pdf',
          purpose: 'chat',
        }),
      });

      const response = await initiateUpload(request);
      expect(response.status).toBe(401);
    });

    it('should return 400 for invalid file size', async () => {
      const { getServerSession } = require('@/lib/auth/server-session');
      getServerSession.mockResolvedValue(mockSession);

      const request = new NextRequest('http://localhost:3000/api/documents/v2/initiate-upload', {
        method: 'POST',
        body: JSON.stringify({
          fileName: 'huge-file.pdf',
          fileSize: 600 * 1024 * 1024, // 600MB - exceeds 500MB limit
          fileType: 'application/pdf',
          purpose: 'chat',
        }),
      });

      const response = await initiateUpload(request);
      expect(response.status).toBe(400);
    });

    it('should return 400 for unsupported file type', async () => {
      const { getServerSession } = require('@/lib/auth/server-session');
      getServerSession.mockResolvedValue(mockSession);

      const request = new NextRequest('http://localhost:3000/api/documents/v2/initiate-upload', {
        method: 'POST',
        body: JSON.stringify({
          fileName: 'malicious.exe',
          fileSize: 1024,
          fileType: 'application/x-msdownload',
          purpose: 'chat',
        }),
      });

      const response = await initiateUpload(request);
      expect(response.status).toBe(400);
    });

    it('should use multipart upload for large files', async () => {
      const { getServerSession } = require('@/lib/auth/server-session');
      const { createDocumentJob } = require('@/lib/services/document-job-service');
      const { generateMultipartUrls } = require('@/lib/aws/document-upload');

      getServerSession.mockResolvedValue(mockSession);
      createDocumentJob.mockResolvedValue({ id: 'job-123' });
      generateMultipartUrls.mockResolvedValue({
        uploadId: 'multipart-123',
        method: 'multipart',
        partUrls: [
          { partNumber: 1, uploadUrl: 'https://part-1-url.com' },
          { partNumber: 2, uploadUrl: 'https://part-2-url.com' },
        ],
      });

      const request = new NextRequest('http://localhost:3000/api/documents/v2/initiate-upload', {
        method: 'POST',
        body: JSON.stringify({
          fileName: 'large-document.pdf',
          fileSize: 50 * 1024 * 1024, // 50MB
          fileType: 'application/pdf',
          purpose: 'repository',
        }),
      });

      const response = await initiateUpload(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.uploadMethod).toBe('multipart');
      expect(data.partUrls).toHaveLength(2);
    });
  });

  describe('GET /api/documents/v2/jobs/[jobId]', () => {
    it('should return job status for existing job', async () => {
      const { getServerSession } = require('@/lib/auth/server-session');
      const { getJobStatus: getJobStatusService } = require('@/lib/services/document-job-service');

      getServerSession.mockResolvedValue(mockSession);
      getJobStatusService.mockResolvedValue({
        id: 'job-123',
        status: 'completed',
        progress: 100,
        result: { text: 'Extracted text content' },
        fileName: 'test.pdf',
        fileSize: 1024 * 1024,
        fileType: 'application/pdf',
        purpose: 'chat',
        processingOptions: { extractText: true },
        createdAt: '2023-01-01T00:00:00Z',
        completedAt: '2023-01-01T00:01:00Z',
      });

      const request = new NextRequest('http://localhost:3000/api/documents/v2/jobs/job-123');
      const response = await getJobStatus(request, { params: { jobId: 'job-123' } });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.jobId).toBe('job-123');
      expect(data.status).toBe('completed');
      expect(data.result).toEqual({ text: 'Extracted text content' });
    });

    it('should return 404 for non-existent job', async () => {
      const { getServerSession } = require('@/lib/auth/server-session');
      const { getJobStatus: getJobStatusService } = require('@/lib/services/document-job-service');

      getServerSession.mockResolvedValue(mockSession);
      getJobStatusService.mockResolvedValue(null);

      const request = new NextRequest('http://localhost:3000/api/documents/v2/jobs/non-existent');
      const response = await getJobStatus(request, { params: { jobId: 'non-existent' } });

      expect(response.status).toBe(404);
    });

    it('should return 401 for unauthenticated request', async () => {
      const { getServerSession } = require('@/lib/auth/server-session');
      getServerSession.mockResolvedValue(null);

      const request = new NextRequest('http://localhost:3000/api/documents/v2/jobs/job-123');
      const response = await getJobStatus(request, { params: { jobId: 'job-123' } });

      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/documents/v2/confirm-upload', () => {
    it('should successfully confirm upload and trigger processing', async () => {
      const { getServerSession } = require('@/lib/auth/server-session');
      const { getJobStatus: getJobStatusService, confirmDocumentUpload } = require('@/lib/services/document-job-service');
      const { sendToProcessingQueue } = require('@/lib/aws/lambda-trigger');

      getServerSession.mockResolvedValue(mockSession);
      getJobStatusService.mockResolvedValue({
        id: 'job-123',
        fileName: 'test.pdf',
        fileSize: 1024 * 1024,
        fileType: 'application/pdf',
        processingOptions: { extractText: true },
      });
      confirmDocumentUpload.mockResolvedValue(undefined);
      sendToProcessingQueue.mockResolvedValue(undefined);

      const request = new NextRequest('http://localhost:3000/api/documents/v2/confirm-upload', {
        method: 'POST',
        body: JSON.stringify({
          uploadId: 'job-123',
          jobId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479', // Valid UUID
        }),
      });

      const response = await confirmUpload(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.status).toBe('processing');
      expect(confirmDocumentUpload).toHaveBeenCalledWith('f47ac10b-58cc-4372-a567-0e02b2c3d479', 'job-123');
      expect(sendToProcessingQueue).toHaveBeenCalled();
    });

    it('should return 400 for invalid UUID format', async () => {
      const { getServerSession } = require('@/lib/auth/server-session');
      getServerSession.mockResolvedValue(mockSession);

      const request = new NextRequest('http://localhost:3000/api/documents/v2/confirm-upload', {
        method: 'POST',
        body: JSON.stringify({
          uploadId: 'upload-123',
          jobId: 'invalid-uuid',
        }),
      });

      const response = await confirmUpload(request);
      expect(response.status).toBe(400);
    });

    it('should return 404 for non-existent job', async () => {
      const { getServerSession } = require('@/lib/auth/server-session');
      const { getJobStatus: getJobStatusService } = require('@/lib/services/document-job-service');

      getServerSession.mockResolvedValue(mockSession);
      getJobStatusService.mockResolvedValue(null);

      const request = new NextRequest('http://localhost:3000/api/documents/v2/confirm-upload', {
        method: 'POST',
        body: JSON.stringify({
          uploadId: 'upload-123',
          jobId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        }),
      });

      const response = await confirmUpload(request);
      expect(response.status).toBe(404);
    });
  });
});