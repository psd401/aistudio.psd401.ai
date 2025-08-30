import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { 
  createDocumentJob, 
  getJobStatus, 
  updateJobStatus,
  confirmDocumentUpload 
} from '@/lib/services/document-job-service';
import { generatePresignedUrl, generateMultipartUrls } from '@/lib/aws/document-upload';
import { sendToProcessingQueue } from '@/lib/aws/lambda-trigger';

// Mock AWS SDK clients
jest.mock('@aws-sdk/client-dynamodb');
jest.mock('@aws-sdk/client-s3');
jest.mock('@aws-sdk/client-sqs');

// Mock environment variables
const originalEnv = process.env;

beforeEach(() => {
  process.env = {
    ...originalEnv,
    DOCUMENT_JOBS_TABLE: 'test-document-jobs-table',
    DOCUMENTS_BUCKET_NAME: 'test-documents-bucket',
    PROCESSING_QUEUE_URL: 'test-processing-queue-url',
    HIGH_MEMORY_QUEUE_URL: 'test-high-memory-queue-url',
  };
});

afterEach(() => {
  process.env = originalEnv;
  jest.clearAllMocks();
});

const mockJobParams = {
  fileName: 'test-document.pdf',
  fileSize: 1024 * 1024, // 1MB
  fileType: 'application/pdf',
  purpose: 'chat' as const,
  userId: 'user-123',
  processingOptions: {
    extractText: true,
    convertToMarkdown: false,
    extractImages: false,
    generateEmbeddings: false,
    ocrEnabled: true,
  },
};

describe('Document Job Service', () => {

  describe('createDocumentJob', () => {
    it('should create a document job with valid parameters', async () => {
      // Mock DynamoDB client
      const mockSend = ((jest.fn() as any) as any).mockResolvedValue({});
      const { DynamoDBClient, PutItemCommand } = require('@aws-sdk/client-dynamodb');
      (DynamoDBClient as jest.Mock).mockImplementation(() => ({ send: mockSend }));

      const job = await createDocumentJob(mockJobParams);

      expect(job.id).toBeDefined();
      expect(job.userId).toBe(mockJobParams.userId);
      expect(job.fileName).toBe(mockJobParams.fileName);
      expect(job.fileSize).toBe(mockJobParams.fileSize);
      expect(job.fileType).toBe(mockJobParams.fileType);
      expect(job.purpose).toBe(mockJobParams.purpose);
      expect(job.status).toBe('pending');
      expect(job.processingOptions).toEqual(mockJobParams.processingOptions);
      expect(job.createdAt).toBeDefined();

      expect(mockSend).toHaveBeenCalledWith(expect.any(PutItemCommand));
    });

    it('should handle DynamoDB errors gracefully', async () => {
      const mockSend = (jest.fn() as any).mockRejectedValue(new Error('DynamoDB error'));
      const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
      (DynamoDBClient as jest.Mock).mockImplementation(() => ({ send: mockSend }));

      await expect(createDocumentJob(mockJobParams)).rejects.toThrow('Failed to create document job');
    });
  });

  describe('updateJobStatus', () => {
    it('should update job status successfully', async () => {
      const mockSend = ((jest.fn() as any) as any).mockResolvedValue({});
      const { DynamoDBClient, PutItemCommand } = require('@aws-sdk/client-dynamodb');
      (DynamoDBClient as jest.Mock).mockImplementation(() => ({ send: mockSend }));

      await updateJobStatus('job-123', 'processing', {
        progress: 50,
        processingStage: 'extracting_text',
      });

      expect(mockSend).toHaveBeenCalledWith(expect.any(PutItemCommand));
    });
  });

  describe('getJobStatus', () => {
    it('should retrieve job status for existing job', async () => {
      const mockJobData = {
        jobId: { S: 'job-123' },
        timestamp: { N: '1234567890' },
        userId: { S: 'user-123' },
        fileName: { S: 'test.pdf' },
        status: { S: 'completed' },
        result: { S: JSON.stringify({ text: 'Extracted text' }) },
      };

      const mockSend = ((jest.fn() as any) as any).mockResolvedValue({
        Items: [mockJobData],
      });
      const { DynamoDBClient, QueryCommand } = require('@aws-sdk/client-dynamodb');
      (DynamoDBClient as jest.Mock).mockImplementation(() => ({ send: mockSend }));

      const job = await getJobStatus('job-123', 'user-123');

      expect(job).toBeTruthy();
      expect(job?.id).toBe('job-123');
      expect(job?.status).toBe('completed');
      expect(mockSend).toHaveBeenCalledWith(expect.any(QueryCommand));
    });

    it('should return null for non-existent job', async () => {
      const mockSend = ((jest.fn() as any) as any).mockResolvedValue({ Items: [] });
      const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
      (DynamoDBClient as jest.Mock).mockImplementation(() => ({ send: mockSend }));

      const job = await getJobStatus('non-existent-job', 'user-123');

      expect(job).toBeNull();
    });
  });
});

describe('Document Upload Service', () => {
  describe('generatePresignedUrl', () => {
    it('should generate a single presigned URL for small files', async () => {
      const mockGetSignedUrl = ((jest.fn() as any) as any).mockResolvedValue('https://presigned-url.com');
      jest.doMock('@aws-sdk/s3-request-presigner', () => ({
        getSignedUrl: mockGetSignedUrl,
      }));

      const config = await generatePresignedUrl('job-123', 'test.pdf');

      expect(config.uploadId).toBe('job-123');
      expect(config.url).toBe('https://presigned-url.com');
      expect(config.method).toBe('single');
    });
  });

  describe('generateMultipartUrls', () => {
    it('should generate multipart URLs for large files', async () => {
      const mockSend = (jest.fn() as any)
        .mockResolvedValueOnce({ UploadId: 'multipart-upload-id' })
        .mockResolvedValue('https://part-1-url.com')
        .mockResolvedValue('https://part-2-url.com');

      const { S3Client, CreateMultipartUploadCommand } = require('@aws-sdk/client-s3');
      S3Client.mockImplementation(() => ({ send: mockSend }));

      const mockGetSignedUrl = (jest.fn() as any)
        .mockResolvedValueOnce('https://part-1-url.com')
        .mockResolvedValueOnce('https://part-2-url.com');
      jest.doMock('@aws-sdk/s3-request-presigner', () => ({
        getSignedUrl: mockGetSignedUrl,
      }));

      const config = await generateMultipartUrls('job-123', 'large-file.pdf', 2);

      expect(config.uploadId).toBe('multipart-upload-id');
      expect(config.method).toBe('multipart');
      expect(config.partUrls).toHaveLength(2);
    });
  });
});

describe('Lambda Trigger Service', () => {
  describe('sendToProcessingQueue', () => {
    it('should send message to standard queue for small files', async () => {
      const mockSend = ((jest.fn() as any) as any).mockResolvedValue({});
      const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');
      SQSClient.mockImplementation(() => ({ send: mockSend }));

      const message = {
        jobId: 'job-123',
        bucket: 'test-bucket',
        key: 'uploads/job-123/test.pdf',
        fileName: 'test.pdf',
        fileSize: 5 * 1024 * 1024, // 5MB
        fileType: 'application/pdf',
        userId: 'user-123',
        processingOptions: {
          extractText: true,
          convertToMarkdown: false,
          extractImages: false,
          generateEmbeddings: false,
          ocrEnabled: true,
        },
      };

      await sendToProcessingQueue(message);

      expect(mockSend).toHaveBeenCalledWith(expect.any(SendMessageCommand));
    });

    it('should send message to high-memory queue for large files', async () => {
      const mockSend = ((jest.fn() as any) as any).mockResolvedValue({});
      const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');
      SQSClient.mockImplementation(() => ({ send: mockSend }));

      const message = {
        jobId: 'job-123',
        bucket: 'test-bucket',
        key: 'uploads/job-123/large-file.pdf',
        fileName: 'large-file.pdf',
        fileSize: 100 * 1024 * 1024, // 100MB
        fileType: 'application/pdf',
        userId: 'user-123',
        processingOptions: {
          extractText: true,
          convertToMarkdown: false,
          extractImages: false,
          generateEmbeddings: false,
          ocrEnabled: true,
        },
      };

      await sendToProcessingQueue(message);

      expect(mockSend).toHaveBeenCalledWith(expect.any(SendMessageCommand));
    });
  });
});

describe('Integration Tests', () => {
  it('should handle complete document upload workflow', async () => {
    // Mock all AWS services
    const mockDynamoSend = ((jest.fn() as any) as any).mockResolvedValue({});
    const mockS3Send = ((jest.fn() as any) as any).mockResolvedValue({ UploadId: 'upload-123' });
    const mockSQSSend = ((jest.fn() as any) as any).mockResolvedValue({});

    const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
    const { S3Client } = require('@aws-sdk/client-s3');
    const { SQSClient } = require('@aws-sdk/client-sqs');

    (DynamoDBClient as jest.Mock).mockImplementation(() => ({ send: mockDynamoSend }));
    (S3Client as jest.Mock).mockImplementation(() => ({ send: mockS3Send }));
    (SQSClient as jest.Mock).mockImplementation(() => ({ send: mockSQSSend }));

    // 1. Create job
    const job = await createDocumentJob(mockJobParams);
    expect(job.status).toBe('pending');

    // 2. Generate upload URL
    const mockGetSignedUrl = ((jest.fn() as any) as any).mockResolvedValue('https://upload-url.com');
    jest.doMock('@aws-sdk/s3-request-presigner', () => ({
      getSignedUrl: mockGetSignedUrl,
    }));

    const uploadConfig = await generatePresignedUrl(job.id, 'test.pdf');
    expect(uploadConfig.url).toBe('https://upload-url.com');

    // 3. Confirm upload
    await confirmDocumentUpload(job.id, uploadConfig.uploadId);

    // 4. Trigger processing
    await sendToProcessingQueue({
      jobId: job.id,
      bucket: 'test-bucket',
      key: `uploads/${job.id}/test.pdf`,
      fileName: 'test.pdf',
      fileSize: mockJobParams.fileSize,
      fileType: mockJobParams.fileType,
      userId: mockJobParams.userId,
      processingOptions: mockJobParams.processingOptions,
    });

    // Verify all services were called
    expect(mockDynamoSend).toHaveBeenCalled();
    expect(mockSQSSend).toHaveBeenCalled();
  });
});