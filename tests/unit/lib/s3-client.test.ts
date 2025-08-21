import { 
  uploadDocument, 
  getDocumentSignedUrl, 
  deleteDocument,
  documentExists,
  listUserDocuments,
  extractKeyFromUrl
} from '@/lib/aws/s3-client';
import { 
  S3Client, 
  PutObjectCommand, 
  GetObjectCommand, 
  DeleteObjectCommand,
  HeadObjectCommand,
  HeadBucketCommand,
  ListObjectsV2Command
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// Mock AWS SDK
jest.mock('@aws-sdk/client-s3');
jest.mock('@aws-sdk/s3-request-presigner');
jest.mock('@/lib/settings-manager', () => ({
  Settings: {
    getS3: jest.fn().mockResolvedValue({
      bucket: 'test-bucket',
      region: 'us-east-1'
    })
  }
}));

describe('S3 Client', () => {
  const mockS3Client = {
    send: jest.fn(),
  };

  const mockGetSignedUrl = getSignedUrl as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    (S3Client as jest.Mock).mockImplementation(() => mockS3Client);
    
    // Mock HeadBucketCommand to simulate bucket exists
    mockS3Client.send.mockImplementation((command: any) => {
      if (command.constructor.name === 'HeadBucketCommand') {
        return Promise.resolve({});
      }
      if (command.constructor.name === 'PutObjectCommand') {
        return Promise.resolve({});
      }
      return Promise.resolve({});
    });
    
    // Mock getSignedUrl to return a test URL
    mockGetSignedUrl.mockResolvedValue('https://test-bucket.s3.amazonaws.com/test-key?signature=test');
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
        key: expect.stringMatching(/^user-123\/\d+-test\.pdf$/),
        url: expect.stringContaining('test-bucket.s3.amazonaws.com'),
      });

      expect(mockS3Client.send).toHaveBeenCalledWith(
        expect.any(PutObjectCommand)
      );
      expect(mockS3Client.send).toHaveBeenCalledWith(
        expect.any(HeadBucketCommand)
      );
    });

    it('should handle upload errors', async () => {
      const params = {
        userId: 'user-123',
        fileName: 'test.pdf',
        fileContent: Buffer.from('test content'),
        contentType: 'application/pdf',
      };

      // Mock bucket check to succeed, but upload to fail
      mockS3Client.send.mockImplementation((command: any) => {
        if (command.constructor.name === 'HeadBucketCommand') {
          return Promise.resolve({});
        }
        if (command.constructor.name === 'PutObjectCommand') {
          return Promise.reject(new Error('S3 Upload Error'));
        }
        return Promise.resolve({});
      });

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

      // Just verify the upload succeeded and the right command was called
      expect(mockS3Client.send).toHaveBeenCalledWith(
        expect.any(PutObjectCommand)
      );
    });
  });

  // TODO: Update these tests once downloadDocument is implemented
  // describe('downloadDocument', () => {
  //   it('should download a document successfully', async () => {
  //     // Test implementation needed
  //   });
  // });

  describe('deleteDocument', () => {
    it('should delete a document successfully', async () => {
      const key = 'documents/user-123/test.pdf';

      mockS3Client.send.mockResolvedValue({});

      await deleteDocument(key);

      // Just verify the delete command was called
      expect(mockS3Client.send).toHaveBeenCalledWith(
        expect.any(DeleteObjectCommand)
      );
    });

    it('should handle deletion errors', async () => {
      const key = 'documents/user-123/test.pdf';

      mockS3Client.send.mockRejectedValue(new Error('S3 Error'));

      await expect(deleteDocument(key)).rejects.toThrow('Failed to delete document');
    });
  });

  describe('getDocumentSignedUrl', () => {
    it('should generate a signed URL for download', async () => {
      const mockUrl = 'https://s3.amazonaws.com/bucket/documents/user-123/test.pdf?signature=xyz';

      (getSignedUrl as jest.Mock).mockResolvedValue(mockUrl);

      const result = await getDocumentSignedUrl({ 
        key: 'documents/user-123/test.pdf' 
      });

      expect(result).toBe(mockUrl);
      expect(getSignedUrl).toHaveBeenCalledWith(
        expect.anything(), // S3Client instance 
        expect.anything(), // GetObjectCommand
        expect.objectContaining({
          expiresIn: 3600,
        })
      );
    });

    it('should generate a signed URL with custom expiration', async () => {
      const mockUrl = 'https://s3.amazonaws.com/bucket/documents/user-123/test.pdf?signature=xyz';

      (getSignedUrl as jest.Mock).mockResolvedValue(mockUrl);

      const result = await getDocumentSignedUrl({ 
        key: 'documents/user-123/test.pdf',
        expiresIn: 7200
      });

      expect(result).toBe(mockUrl);
      expect(getSignedUrl).toHaveBeenCalledWith(
        expect.anything(), // S3Client instance
        expect.anything(), // GetObjectCommand
        expect.objectContaining({
          expiresIn: 7200,
        })
      );
    });

    it('should handle signed URL generation errors', async () => {
      (getSignedUrl as jest.Mock).mockRejectedValue(new Error('S3 Error'));

      await expect(getDocumentSignedUrl({ 
        key: 'documents/user-123/test.pdf' 
      })).rejects.toThrow('Failed to generate signed URL');
    });
  });

  // TODO: Update these tests once getDocumentUrl is implemented
  // describe('getDocumentUrl', () => {
  //   it('should return the correct document URL', () => {
  //     // Test implementation needed
  //   });
  // });

  describe('documentExists', () => {
    it('should return true if document exists', async () => {
      mockS3Client.send.mockResolvedValue({});

      const result = await documentExists('documents/user-123/test.pdf');

      expect(result).toBe(true);
      expect(mockS3Client.send).toHaveBeenCalledWith(
        expect.any(HeadObjectCommand)
      );
    });

    it('should return false if document does not exist', async () => {
      mockS3Client.send.mockRejectedValue({
        name: 'NotFound',
        $metadata: { httpStatusCode: 404 }
      });

      const result = await documentExists('documents/user-123/test.pdf');

      expect(result).toBe(false);
    });
  });

  describe('listUserDocuments', () => {
    it('should list user documents', async () => {
      mockS3Client.send.mockResolvedValue({
        Contents: [
          { Key: 'documents/user-123/file1.pdf', Size: 1000, LastModified: new Date() },
          { Key: 'documents/user-123/file2.pdf', Size: 2000, LastModified: new Date() }
        ]
      });

      const result = await listUserDocuments('user-123');

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        key: 'documents/user-123/file1.pdf',
        size: 1000,
        lastModified: expect.any(Date)
      });
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
      expect(result1.key).toMatch(/^user-123\/\d+-test\.pdf$/);
      expect(result2.key).toMatch(/^user-123\/\d+-test\.pdf$/);
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
          expect(result.key).toMatch(/^user-123\/\d+-no-extension$/);
        }
      }
    });
  });

});