import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

// Mock AWS SDK clients
jest.mock('@aws-sdk/client-dynamodb');
jest.mock('@aws-sdk/client-s3');
jest.mock('@aws-sdk/client-sqs');
jest.mock('@aws-sdk/s3-request-presigner');

// NOW import the modules that use the AWS SDK
import { 
  createDocumentJob, 
  getJobStatus, 
  updateJobStatus,
  confirmDocumentUpload 
} from '@/lib/services/document-job-service';
import { generatePresignedUrl, generateMultipartUrls } from '@/lib/aws/document-upload';
import { sendToProcessingQueue } from '@/lib/aws/lambda-trigger';

// Mock environment variables
const originalEnv = process.env;

// Mock clients
let mockDynamoDBClient: any;
let mockS3Client: any;
let mockSQSClient: any;
let mockGetSignedUrl: any;

beforeEach(() => {
  process.env = {
    ...originalEnv,
    NODE_ENV: 'test',
    AWS_REGION: 'us-east-1',
    AWS_DEFAULT_REGION: 'us-east-1',
    DOCUMENT_JOBS_TABLE: 'test-document-jobs-table',
    DOCUMENTS_BUCKET_NAME: 'test-documents-bucket',
    PROCESSING_QUEUE_URL: 'https://sqs.us-east-1.amazonaws.com/123456789012/test-processing-queue',
    HIGH_MEMORY_QUEUE_URL: 'https://sqs.us-east-1.amazonaws.com/123456789012/test-high-memory-queue',
  };
  
  jest.clearAllMocks();
  
  // Set up mocks after clearing
  const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
  const { S3Client } = require('@aws-sdk/client-s3');
  const { SQSClient } = require('@aws-sdk/client-sqs');
  const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
  
  mockDynamoDBClient = { send: jest.fn() };
  mockS3Client = { send: jest.fn() };
  mockSQSClient = { send: jest.fn() };
  mockGetSignedUrl = getSignedUrl;
  
  (DynamoDBClient as jest.Mock).mockImplementation(() => mockDynamoDBClient);
  (S3Client as jest.Mock).mockImplementation(() => mockS3Client);
  (SQSClient as jest.Mock).mockImplementation(() => mockSQSClient);
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

describe.skip('Document Job Service', () => {

  describe('createDocumentJob', () => {
    it('should create a document job with valid parameters', async () => {
      mockDynamoDBClient.send.mockResolvedValue({});

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

      expect(mockDynamoDBClient.send).toHaveBeenCalledWith(expect.anything());
    });

    it('should handle DynamoDB errors gracefully', async () => {
      mockDynamoDBClient.send.mockRejectedValue(new Error('DynamoDB error'));

      await expect(createDocumentJob(mockJobParams)).rejects.toThrow('Failed to create document job');
    });
  });

  describe('updateJobStatus', () => {
    it('should update job status successfully', async () => {
      mockDynamoDBClient.send.mockResolvedValue({});

      await updateJobStatus('job-123', 'processing', {
        progress: 50,
        processingStage: 'extracting_text',
      });

      expect(mockDynamoDBClient.send).toHaveBeenCalledWith(expect.anything());
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

      mockDynamoDBClient.send.mockResolvedValue({
        Items: [mockJobData],
      });

      const job = await getJobStatus('job-123', 'user-123');

      expect(job).toBeTruthy();
      expect(job?.id).toBe('job-123');
      expect(job?.status).toBe('completed');
      expect(mockDynamoDBClient.send).toHaveBeenCalledWith(expect.anything());
    });

    it('should return null for non-existent job', async () => {
      mockDynamoDBClient.send.mockResolvedValue({ Items: [] });

      const job = await getJobStatus('non-existent-job', 'user-123');

      expect(job).toBeNull();
    });
  });
});

describe.skip('Document Upload Service', () => {
  describe('generatePresignedUrl', () => {
    it('should generate a single presigned URL for small files', async () => {
      mockGetSignedUrl.mockResolvedValue('https://presigned-url.com');

      const config = await generatePresignedUrl('job-123', 'test.pdf');

      expect(config.uploadId).toBe('job-123');
      expect(config.url).toBe('https://presigned-url.com');
      expect(config.method).toBe('single');
    });
  });

  describe('generateMultipartUrls', () => {
    it('should generate multipart URLs for large files', async () => {
      mockS3Client.send.mockResolvedValueOnce({ UploadId: 'multipart-upload-id' });
      mockGetSignedUrl
        .mockResolvedValueOnce('https://part-1-url.com')
        .mockResolvedValueOnce('https://part-2-url.com');

      const config = await generateMultipartUrls('job-123', 'large-file.pdf', 2);

      expect(config.uploadId).toBe('multipart-upload-id');
      expect(config.method).toBe('multipart');
      expect(config.partUrls).toHaveLength(2);
    });
  });
});

describe.skip('Lambda Trigger Service', () => {
  describe('sendToProcessingQueue', () => {
    it('should send message to standard queue for small files', async () => {
      mockSQSClient.send.mockResolvedValue({});

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

      expect(mockSQSClient.send).toHaveBeenCalledWith(expect.anything());
    });

    it('should send message to high-memory queue for large files', async () => {
      mockSQSClient.send.mockResolvedValue({});

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

      expect(mockSQSClient.send).toHaveBeenCalledWith(expect.anything());
    });
  });
});

describe.skip('Integration Tests', () => {
  it('should handle complete document upload workflow', async () => {
    // Set up mocks for workflow
    mockDynamoDBClient.send.mockResolvedValue({});
    mockS3Client.send.mockResolvedValue({ UploadId: 'upload-123' });
    mockSQSClient.send.mockResolvedValue({});

    // 1. Create job
    const job = await createDocumentJob(mockJobParams);
    expect(job.status).toBe('pending');

    // 2. Generate upload URL
    mockGetSignedUrl.mockResolvedValue('https://upload-url.com');

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
    expect(mockDynamoDBClient.send).toHaveBeenCalled();
    expect(mockSQSClient.send).toHaveBeenCalled();
  });
});