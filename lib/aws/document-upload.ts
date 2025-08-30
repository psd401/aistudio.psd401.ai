import { S3Client, PutObjectCommand, CreateMultipartUploadCommand, UploadPartCommand, CompleteMultipartUploadCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createLogger } from '@/lib/logger';

const s3Client = new S3Client({});
const log = createLogger({ service: 'document-upload' });

const DOCUMENTS_BUCKET = process.env.DOCUMENTS_BUCKET_NAME || 'aistudio-documents-dev';
const PRESIGNED_URL_EXPIRY = 3600; // 1 hour

export interface PresignedUploadConfig {
  uploadId: string;
  url?: string;
  method: 'single' | 'multipart';
  partUrls?: Array<{
    partNumber: number;
    uploadUrl: string;
  }>;
}

export async function generatePresignedUrl(jobId: string, fileName: string): Promise<PresignedUploadConfig> {
  try {
    // Generate S3 key with job ID for organization
    const s3Key = `uploads/${jobId}/${sanitizeFileName(fileName)}`;
    
    const command = new PutObjectCommand({
      Bucket: DOCUMENTS_BUCKET,
      Key: s3Key,
      ContentType: getContentType(fileName),
      Metadata: {
        jobId,
        originalFileName: fileName,
        uploadTimestamp: Date.now().toString(),
      },
    });

    const uploadUrl = await getSignedUrl(s3Client, command, {
      expiresIn: PRESIGNED_URL_EXPIRY,
    });

    log.info('Generated single presigned URL', { jobId, fileName, s3Key });

    return {
      uploadId: jobId, // Use jobId as uploadId for single uploads
      url: uploadUrl,
      method: 'single',
    };
  } catch (error) {
    log.error('Failed to generate presigned URL', { error, jobId, fileName });
    throw new Error(`Failed to generate presigned URL: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function generateMultipartUrls(jobId: string, fileName: string, partCount: number): Promise<PresignedUploadConfig> {
  try {
    const s3Key = `uploads/${jobId}/${sanitizeFileName(fileName)}`;
    
    // Initialize multipart upload
    const createMultipartCommand = new CreateMultipartUploadCommand({
      Bucket: DOCUMENTS_BUCKET,
      Key: s3Key,
      ContentType: getContentType(fileName),
      Metadata: {
        jobId,
        originalFileName: fileName,
        uploadTimestamp: Date.now().toString(),
        partCount: partCount.toString(),
      },
    });

    const multipartResponse = await s3Client.send(createMultipartCommand);
    
    if (!multipartResponse.UploadId) {
      throw new Error('Failed to initialize multipart upload');
    }

    const uploadId = multipartResponse.UploadId;
    const partUrls: Array<{ partNumber: number; uploadUrl: string }> = [];

    // Generate presigned URLs for each part
    for (let partNumber = 1; partNumber <= partCount; partNumber++) {
      const uploadPartCommand = new UploadPartCommand({
        Bucket: DOCUMENTS_BUCKET,
        Key: s3Key,
        PartNumber: partNumber,
        UploadId: uploadId,
      });

      const partUrl = await getSignedUrl(s3Client, uploadPartCommand, {
        expiresIn: PRESIGNED_URL_EXPIRY,
      });

      partUrls.push({
        partNumber,
        uploadUrl: partUrl,
      });
    }

    log.info('Generated multipart presigned URLs', { 
      jobId, 
      fileName, 
      s3Key, 
      uploadId,
      partCount 
    });

    return {
      uploadId,
      method: 'multipart',
      partUrls,
    };
  } catch (error) {
    log.error('Failed to generate multipart URLs', { error, jobId, fileName, partCount });
    throw new Error(`Failed to generate multipart URLs: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function completeMultipartUpload(
  jobId: string,
  fileName: string,
  uploadId: string,
  parts: Array<{ ETag: string; PartNumber: number }>
): Promise<void> {
  try {
    const s3Key = `uploads/${jobId}/${sanitizeFileName(fileName)}`;
    
    const completeCommand = new CompleteMultipartUploadCommand({
      Bucket: DOCUMENTS_BUCKET,
      Key: s3Key,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: parts.map(part => ({
          ETag: part.ETag.replace(/"/g, ''), // Remove quotes from ETag
          PartNumber: part.PartNumber,
        })),
      },
    });

    await s3Client.send(completeCommand);
    
    log.info('Completed multipart upload', { jobId, fileName, uploadId, partCount: parts.length });
  } catch (error) {
    log.error('Failed to complete multipart upload', { error, jobId, fileName, uploadId });
    throw new Error(`Failed to complete multipart upload: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function abortMultipartUpload(
  jobId: string,
  fileName: string,
  uploadId: string
): Promise<void> {
  try {
    const s3Key = `uploads/${jobId}/${sanitizeFileName(fileName)}`;
    
    const { AbortMultipartUploadCommand } = await import('@aws-sdk/client-s3');
    const abortCommand = new AbortMultipartUploadCommand({
      Bucket: DOCUMENTS_BUCKET,
      Key: s3Key,
      UploadId: uploadId,
    });

    await s3Client.send(abortCommand);
    
    log.info('Aborted multipart upload', { jobId, fileName, uploadId });
  } catch (error) {
    log.error('Failed to abort multipart upload', { error, jobId, fileName, uploadId });
    // Don't throw here as this is cleanup - log the error but continue
  }
}

function sanitizeFileName(fileName: string): string {
  // Remove dangerous characters and limit length
  return fileName
    .replace(/[^a-zA-Z0-9.-]/g, '_')
    .replace(/__+/g, '_') // Replace multiple underscores with single
    .substring(0, 255);
}

function getContentType(fileName: string): string {
  const extension = fileName.split('.').pop()?.toLowerCase() || '';
  
  const contentTypes: Record<string, string> = {
    pdf: 'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    txt: 'text/plain',
    md: 'text/markdown',
    csv: 'text/csv',
  };

  return contentTypes[extension] || 'application/octet-stream';
}

export interface S3UploadResult {
  s3Key: string;
  bucket: string;
  url: string;
}

export async function getSignedDownloadUrl(s3Key: string, expiresIn: number = 3600): Promise<string> {
  try {
    const { GetObjectCommand } = await import('@aws-sdk/client-s3');
    const command = new GetObjectCommand({
      Bucket: DOCUMENTS_BUCKET,
      Key: s3Key,
    });

    const url = await getSignedUrl(s3Client, command, { expiresIn });
    
    log.info('Generated signed download URL', { s3Key, expiresIn });
    return url;
  } catch (error) {
    log.error('Failed to generate signed download URL', { error, s3Key });
    throw new Error(`Failed to generate download URL: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}