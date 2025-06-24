import { 
  uploadDocument, 
  getDocumentUrl, 
  deleteDocument, 
  downloadDocument,
  generatePresignedUrl 
} from '@/lib/aws/s3-client';
import { 
  S3Client, 
  PutObjectCommand, 
  GetObjectCommand, 
  DeleteObjectCommand 
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// Mock AWS SDK
jest.mock('@aws-sdk/client-s3');
jest.mock('@aws-sdk/s3-request-presigner');

describe('S3 Client', () => {
  const mockS3Client = {
    send: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (S3Client as jest.Mock).mockImplementation(() => mockS3Client);
  });

  describe('uploadDocument', () => {
    it('should upload a document successfully', async () => {
      const params = {
        userId: 'user-123',
        fileName: 'test.pdf',
        fileContent: Buffer.from('test content'),
        contentType: 'application/pdf',
        metadata: { originalName: 'test.pdf' },
      };

      mockS3Client.send.mockResolvedValue({});

      const result = await uploadDocument(params);

      expect(result).toEqual({
        key: expect.stringMatching(/^documents\/user-123\/\d+-test\.pdf$/),
        url: expect.stringContaining('/documents/user-123/'),
      });

      expect(mockS3Client.send).toHaveBeenCalledWith(
        expect.any(PutObjectCommand)
      );

      const command = mockS3Client.send.mock.calls[0][0];
      expect(command.input).toMatchObject({
        Bucket: expect.any(String),
        Key: expect.stringMatching(/^documents\/user-123\/\d+-test\.pdf$/),
        Body: params.fileContent,
        ContentType: 'application/pdf',
        Metadata: {
          userId: 'user-123',
          originalName: 'test.pdf',
        },
      });
    });

    it('should handle upload errors', async () => {
      const params = {
        userId: 'user-123',
        fileName: 'test.pdf',
        fileContent: Buffer.from('test content'),
        contentType: 'application/pdf',
      };

      mockS3Client.send.mockRejectedValue(new Error('S3 Error'));

      await expect(uploadDocument(params)).rejects.toThrow('Failed to upload document');
    });

    it('should include custom metadata', async () => {
      const params = {
        userId: 'user-123',
        fileName: 'test.pdf',
        fileContent: Buffer.from('test content'),
        contentType: 'application/pdf',
        metadata: {
          category: 'reports',
          tags: 'financial,quarterly',
        },
      };

      mockS3Client.send.mockResolvedValue({});

      await uploadDocument(params);

      const command = mockS3Client.send.mock.calls[0][0];
      expect(command.input.Metadata).toEqual({
        userId: 'user-123',
        category: 'reports',
        tags: 'financial,quarterly',
      });
    });
  });

  describe('downloadDocument', () => {
    it('should download a document successfully', async () => {
      const key = 'documents/user-123/test.pdf';
      const mockBody = {
        transformToByteArray: jest.fn().mockResolvedValue(Buffer.from('test content')),
      };

      mockS3Client.send.mockResolvedValue({
        Body: mockBody,
        ContentType: 'application/pdf',
        Metadata: { originalName: 'test.pdf' },
      });

      const result = await downloadDocument(key);

      expect(result).toEqual({
        content: expect.any(Buffer),
        contentType: 'application/pdf',
        metadata: { originalName: 'test.pdf' },
      });

      expect(mockS3Client.send).toHaveBeenCalledWith(
        expect.any(GetObjectCommand)
      );
    });

    it('should handle download errors', async () => {
      const key = 'documents/user-123/test.pdf';

      mockS3Client.send.mockRejectedValue(new Error('S3 Error'));

      await expect(downloadDocument(key)).rejects.toThrow('Failed to download document');
    });

    it('should handle missing document body', async () => {
      const key = 'documents/user-123/test.pdf';

      mockS3Client.send.mockResolvedValue({
        Body: null,
        ContentType: 'application/pdf',
      });

      await expect(downloadDocument(key)).rejects.toThrow('Document not found');
    });
  });

  describe('deleteDocument', () => {
    it('should delete a document successfully', async () => {
      const key = 'documents/user-123/test.pdf';

      mockS3Client.send.mockResolvedValue({});

      await deleteDocument(key);

      expect(mockS3Client.send).toHaveBeenCalledWith(
        expect.any(DeleteObjectCommand)
      );

      const command = mockS3Client.send.mock.calls[0][0];
      expect(command.input).toMatchObject({
        Bucket: expect.any(String),
        Key: key,
      });
    });

    it('should handle deletion errors', async () => {
      const key = 'documents/user-123/test.pdf';

      mockS3Client.send.mockRejectedValue(new Error('S3 Error'));

      await expect(deleteDocument(key)).rejects.toThrow('Failed to delete document');
    });
  });

  describe('generatePresignedUrl', () => {
    it('should generate a presigned URL for download', async () => {
      const key = 'documents/user-123/test.pdf';
      const mockUrl = 'https://s3.amazonaws.com/bucket/documents/user-123/test.pdf?signature=xyz';

      (getSignedUrl as jest.Mock).mockResolvedValue(mockUrl);

      const result = await generatePresignedUrl(key);

      expect(result).toBe(mockUrl);
      expect(getSignedUrl).toHaveBeenCalledWith(
        expect.any(S3Client),
        expect.any(GetObjectCommand),
        expect.objectContaining({
          expiresIn: 3600,
        })
      );
    });

    it('should generate a presigned URL for upload', async () => {
      const key = 'documents/user-123/test.pdf';
      const mockUrl = 'https://s3.amazonaws.com/bucket/documents/user-123/test.pdf?signature=xyz';

      (getSignedUrl as jest.Mock).mockResolvedValue(mockUrl);

      const result = await generatePresignedUrl(key, 'upload', 7200);

      expect(result).toBe(mockUrl);
      expect(getSignedUrl).toHaveBeenCalledWith(
        expect.any(S3Client),
        expect.any(PutObjectCommand),
        expect.objectContaining({
          expiresIn: 7200,
        })
      );
    });

    it('should handle presigned URL generation errors', async () => {
      const key = 'documents/user-123/test.pdf';

      (getSignedUrl as jest.Mock).mockRejectedValue(new Error('S3 Error'));

      await expect(generatePresignedUrl(key)).rejects.toThrow('Failed to generate presigned URL');
    });
  });

  describe('getDocumentUrl', () => {
    it('should return the correct document URL', () => {
      const key = 'documents/user-123/test.pdf';
      const url = getDocumentUrl(key);

      expect(url).toContain(key);
      expect(url).toMatch(/^https:\/\/.+\.amazonaws\.com\/.+/);
    });
  });

  describe('Key Generation', () => {
    it('should generate unique keys for same filename', async () => {
      const params = {
        userId: 'user-123',
        fileName: 'test.pdf',
        fileContent: Buffer.from('test content'),
        contentType: 'application/pdf',
      };

      mockS3Client.send.mockResolvedValue({});

      const result1 = await uploadDocument(params);
      await new Promise(resolve => setTimeout(resolve, 10)); // Small delay
      const result2 = await uploadDocument(params);

      expect(result1.key).not.toBe(result2.key);
      expect(result1.key).toMatch(/^documents\/user-123\/\d+-test\.pdf$/);
      expect(result2.key).toMatch(/^documents\/user-123\/\d+-test\.pdf$/);
    });

    it('should preserve file extensions', async () => {
      const testCases = [
        { fileName: 'test.pdf', expectedExt: '.pdf' },
        { fileName: 'report.docx', expectedExt: '.docx' },
        { fileName: 'data.txt', expectedExt: '.txt' },
        { fileName: 'no-extension', expectedExt: '' },
      ];

      for (const testCase of testCases) {
        mockS3Client.send.mockResolvedValue({});

        const result = await uploadDocument({
          userId: 'user-123',
          fileName: testCase.fileName,
          fileContent: Buffer.from('test'),
          contentType: 'application/octet-stream',
        });

        if (testCase.expectedExt) {
          expect(result.key).toMatch(new RegExp(`${testCase.expectedExt}$`));
        } else {
          expect(result.key).toMatch(/^documents\/user-123\/\d+-no-extension$/);
        }
      }
    });
  });

  describe('Environment Configuration', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      jest.resetModules();
      process.env = { ...originalEnv };
    });

    afterAll(() => {
      process.env = originalEnv;
    });

    it('should use environment variables for configuration', () => {
      process.env.AWS_REGION = 'us-west-2';
      process.env.AWS_S3_BUCKET_NAME = 'test-bucket';

      // Re-import to get new environment values
      jest.isolateModules(() => {
        require('@/lib/aws/s3-client');
      });

      expect(S3Client).toHaveBeenCalledWith(
        expect.objectContaining({
          region: 'us-west-2',
        })
      );
    });

    it('should use default values when environment variables are not set', () => {
      delete process.env.AWS_REGION;
      delete process.env.AWS_S3_BUCKET_NAME;

      // Re-import to get default values
      jest.isolateModules(() => {
        require('@/lib/aws/s3-client');
      });

      expect(S3Client).toHaveBeenCalledWith(
        expect.objectContaining({
          region: 'us-east-1',
        })
      );
    });
  });
});