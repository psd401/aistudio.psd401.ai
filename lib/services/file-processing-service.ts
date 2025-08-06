import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { S3Client, PutObjectCommand, CreateMultipartUploadCommand, UploadPartCommand, CompleteMultipartUploadCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { v4 as uuidv4 } from 'uuid';

const s3Client = new S3Client({});
const sqsClient = new SQSClient({});
const lambdaClient = new LambdaClient({});

interface FileProcessingJob {
  jobId: string;
  itemId: number;
  fileKey: string;
  fileName: string;
  fileType: string;
  bucketName: string;
}

interface URLProcessingJob {
  jobId: string;
  itemId: number;
  url: string;
  itemName: string;
}

/**
 * Generate a presigned URL for uploading a file to S3
 */
export async function generateUploadUrl(
  fileName: string,
  contentType: string,
  repositoryId: number
): Promise<{ uploadUrl: string; fileKey: string }> {
  const bucketName = process.env.DOCUMENTS_BUCKET_NAME;
  if (!bucketName) {
    throw new Error('DOCUMENTS_BUCKET_NAME environment variable not set');
  }

  // Generate unique file key
  const fileId = uuidv4();
  const fileKey = `repositories/${repositoryId}/${fileId}/${fileName}`;

  // Create presigned URL for upload
  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: fileKey,
    ContentType: contentType,
  });

  const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 }); // 1 hour

  return { uploadUrl, fileKey };
}

/**
 * Generate presigned URLs for multipart upload
 */
export async function generateMultipartUploadUrls(
  fileName: string,
  contentType: string,
  repositoryId: number,
  parts: number
): Promise<{
  uploadId: string;
  fileKey: string;
  partUrls: { partNumber: number; uploadUrl: string }[];
}> {
  const bucketName = process.env.DOCUMENTS_BUCKET_NAME;
  if (!bucketName) {
    throw new Error('DOCUMENTS_BUCKET_NAME environment variable not set');
  }

  // Generate unique file key
  const fileId = uuidv4();
  const fileKey = `repositories/${repositoryId}/${fileId}/${fileName}`;

  // Initiate multipart upload
  const createCommand = new CreateMultipartUploadCommand({
    Bucket: bucketName,
    Key: fileKey,
    ContentType: contentType,
  });

  const { UploadId } = await s3Client.send(createCommand);
  if (!UploadId) {
    throw new Error('Failed to initiate multipart upload');
  }

  // Generate presigned URLs for each part
  const partUrls = await Promise.all(
    Array.from({ length: parts }, async (_, i) => {
      const partNumber = i + 1;
      const uploadPartCommand = new UploadPartCommand({
        Bucket: bucketName,
        Key: fileKey,
        UploadId,
        PartNumber: partNumber,
      });

      const uploadUrl = await getSignedUrl(s3Client, uploadPartCommand, {
        expiresIn: 3600,
      });

      return { partNumber, uploadUrl };
    })
  );

  return { uploadId: UploadId, fileKey, partUrls };
}

/**
 * Complete a multipart upload
 */
export async function completeMultipartUpload(
  fileKey: string,
  uploadId: string,
  parts: { ETag: string; PartNumber: number }[]
): Promise<void> {
  const bucketName = process.env.DOCUMENTS_BUCKET_NAME;
  if (!bucketName) {
    throw new Error('DOCUMENTS_BUCKET_NAME environment variable not set');
  }

  const command = new CompleteMultipartUploadCommand({
    Bucket: bucketName,
    Key: fileKey,
    UploadId: uploadId,
    MultipartUpload: {
      Parts: parts.sort((a, b) => a.PartNumber - b.PartNumber),
    },
  });

  await s3Client.send(command);
}

/**
 * Queue a file for processing
 */
export async function queueFileForProcessing(
  itemId: number,
  fileKey: string,
  fileName: string,
  fileType: string
): Promise<string> {
  const queueUrl = process.env.FILE_PROCESSING_QUEUE_URL;
  if (!queueUrl) {
    throw new Error('FILE_PROCESSING_QUEUE_URL environment variable not set');
  }

  const bucketName = process.env.DOCUMENTS_BUCKET_NAME;
  if (!bucketName) {
    throw new Error('DOCUMENTS_BUCKET_NAME environment variable not set');
  }

  const jobId = uuidv4();
  const job: FileProcessingJob = {
    jobId,
    itemId,
    fileKey,
    fileName,
    fileType,
    bucketName,
  };

  const command = new SendMessageCommand({
    QueueUrl: queueUrl,
    MessageBody: JSON.stringify(job),
    MessageAttributes: {
      itemId: {
        DataType: 'Number',
        StringValue: itemId.toString(),
      },
      jobType: {
        DataType: 'String',
        StringValue: 'file',
      },
    },
  });

  await sqsClient.send(command);
  return jobId;
}

/**
 * Process a URL directly (invoke Lambda)
 */
export async function processUrl(
  itemId: number,
  url: string,
  itemName: string
): Promise<string> {
  const functionName = process.env.URL_PROCESSOR_FUNCTION_NAME;
  if (!functionName) {
    throw new Error('URL_PROCESSOR_FUNCTION_NAME environment variable not set');
  }

  const jobId = uuidv4();
  const job: URLProcessingJob = {
    jobId,
    itemId,
    url,
    itemName,
  };

  const command = new InvokeCommand({
    FunctionName: functionName,
    InvocationType: 'Event', // Async invocation
    Payload: JSON.stringify(job),
  });

  await lambdaClient.send(command);
  return jobId;
}

/**
 * Get supported file types and their MIME types
 */
export function getSupportedFileTypes(): Record<string, string> {
  return {
    'application/pdf': '.pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
    'application/msword': '.doc',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
    'application/vnd.ms-excel': '.xls',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
    'application/vnd.ms-powerpoint': '.ppt',
    'text/plain': '.txt',
    'text/markdown': '.md',
    'text/csv': '.csv',
  };
}

/**
 * Check if a file type is supported
 */
export function isFileTypeSupported(contentType: string): boolean {
  return contentType in getSupportedFileTypes();
}

// Note: getMaxFileSize has been moved to @/lib/file-validation for centralization
// Import from there if needed: import { getMaxFileSize } from '@/lib/file-validation'