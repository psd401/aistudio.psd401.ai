import { DynamoDBClient, PutItemCommand, QueryCommand, AttributeValue } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { createLogger } from '@/lib/logger';

const dynamoClient = new DynamoDBClient({});
const DOCUMENT_JOBS_TABLE = process.env.DOCUMENT_JOBS_TABLE || 'AIStudio-DocumentJobs-Dev';
const log = createLogger({ service: 'document-job-service' });

export interface ProcessingOptions {
  extractText: boolean;
  convertToMarkdown: boolean;
  extractImages: boolean;
  generateEmbeddings: boolean;
  ocrEnabled: boolean;
}

export interface DocumentJob {
  id: string;
  userId: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  purpose: 'chat' | 'repository' | 'assistant';
  processingOptions: ProcessingOptions;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress?: number;
  processingStage?: string;
  result?: Record<string, unknown>;
  resultLocation?: 's3' | 'dynamodb';
  resultS3Key?: string;
  errorMessage?: string;
  createdAt: string;
  completedAt?: string;
}

export interface CreateJobParams {
  fileName: string;
  fileSize: number;
  fileType: string;
  purpose: 'chat' | 'repository' | 'assistant';
  userId: string;
  processingOptions: ProcessingOptions;
}

export async function createDocumentJob(params: CreateJobParams): Promise<DocumentJob> {
  const jobId = crypto.randomUUID();
  const timestamp = Date.now();
  const ttl = Math.floor(timestamp / 1000) + 86400 * 7; // 7 days TTL

  const job: DocumentJob = {
    id: jobId,
    userId: params.userId,
    fileName: params.fileName,
    fileSize: params.fileSize,
    fileType: params.fileType,
    purpose: params.purpose,
    processingOptions: params.processingOptions,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };

  try {
    await dynamoClient.send(
      new PutItemCommand({
        TableName: DOCUMENT_JOBS_TABLE,
        Item: marshall({
          jobId,
          timestamp,
          userId: params.userId,
          fileName: params.fileName,
          fileSize: params.fileSize,
          fileType: params.fileType,
          purpose: params.purpose,
          processingOptions: params.processingOptions,
          status: 'pending',
          createdAt: job.createdAt,
          ttl,
        }),
        ConditionExpression: 'attribute_not_exists(jobId)', // Prevent duplicates
      })
    );

    log.info('Document job created', { jobId, fileName: params.fileName, userId: params.userId });
    return job;
  } catch (error) {
    log.error('Failed to create document job', { error, params });
    throw new Error(`Failed to create document job: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function getJobStatus(jobId: string, userId?: string): Promise<DocumentJob | null> {
  try {
    // Query for the latest status entry for this job
    const response = await dynamoClient.send(
      new QueryCommand({
        TableName: DOCUMENT_JOBS_TABLE,
        KeyConditionExpression: 'jobId = :jobId',
        ExpressionAttributeValues: marshall({
          ':jobId': jobId,
          ...(userId && { ':userId': userId }),
        }),
        // Add filter expression if userId is provided for security
        ...(userId && {
          FilterExpression: 'userId = :userId',
        }),
        ScanIndexForward: false, // Get latest entries first
        Limit: 1,
      })
    );

    if (!response.Items || response.Items.length === 0) {
      return null;
    }

    const item = unmarshall(response.Items[0]);
    
    return {
      id: item.jobId,
      userId: item.userId,
      fileName: item.fileName,
      fileSize: item.fileSize,
      fileType: item.fileType,
      purpose: item.purpose,
      processingOptions: item.processingOptions,
      status: item.status,
      progress: item.progress,
      processingStage: item.processingStage,
      result: item.result,
      resultLocation: item.resultLocation,
      resultS3Key: item.resultS3Key,
      errorMessage: item.errorMessage,
      createdAt: item.createdAt,
      completedAt: item.completedAt,
    };
  } catch (error) {
    log.error('Failed to get job status', { error, jobId, userId });
    throw new Error(`Failed to get job status: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function updateJobStatus(
  jobId: string,
  status: DocumentJob['status'],
  updates: Partial<Pick<DocumentJob, 'progress' | 'processingStage' | 'result' | 'resultLocation' | 'resultS3Key' | 'errorMessage' | 'completedAt'>> = {}
): Promise<void> {
  const timestamp = Date.now();
  const ttl = Math.floor(timestamp / 1000) + 86400 * 7; // 7 days TTL

  try {
    // Insert a new status entry (append-only pattern for DynamoDB)
    await dynamoClient.send(
      new PutItemCommand({
        TableName: DOCUMENT_JOBS_TABLE,
        Item: marshall({
          jobId,
          timestamp,
          status,
          ttl,
          ...updates,
          ...(status === 'completed' && !updates.completedAt && {
            completedAt: new Date().toISOString(),
          }),
        }),
      })
    );

    log.info('Job status updated', { jobId, status, updates });
  } catch (error) {
    log.error('Failed to update job status', { error, jobId, status, updates });
    throw new Error(`Failed to update job status: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function confirmDocumentUpload(jobId: string, uploadId: string): Promise<void> {
  try {
    await updateJobStatus(jobId, 'processing', {
      processingStage: 'upload_confirmed',
      progress: 10,
    });

    log.info('Document upload confirmed', { jobId, uploadId });
  } catch (error) {
    log.error('Failed to confirm document upload', { error, jobId, uploadId });
    throw new Error(`Failed to confirm upload: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function getUserJobs(
  userId: string,
  limit: number = 20,
  lastEvaluatedKey?: Record<string, AttributeValue>
): Promise<{ jobs: DocumentJob[]; lastEvaluatedKey?: Record<string, AttributeValue> }> {
  try {
    const response = await dynamoClient.send(
      new QueryCommand({
        TableName: DOCUMENT_JOBS_TABLE,
        IndexName: 'UserIdIndex',
        KeyConditionExpression: 'userId = :userId',
        ExpressionAttributeValues: marshall({
          ':userId': userId,
        }),
        ScanIndexForward: false, // Get newest first
        Limit: limit,
        ...(lastEvaluatedKey && { ExclusiveStartKey: lastEvaluatedKey }),
      })
    );

    const jobs = (response.Items || []).map(item => {
      const unmarshalled = unmarshall(item);
      return {
        id: unmarshalled.jobId,
        userId: unmarshalled.userId,
        fileName: unmarshalled.fileName,
        fileSize: unmarshalled.fileSize,
        fileType: unmarshalled.fileType,
        purpose: unmarshalled.purpose,
        processingOptions: unmarshalled.processingOptions,
        status: unmarshalled.status,
        progress: unmarshalled.progress,
        processingStage: unmarshalled.processingStage,
        result: unmarshalled.result,
        resultLocation: unmarshalled.resultLocation,
        resultS3Key: unmarshalled.resultS3Key,
        errorMessage: unmarshalled.errorMessage,
        createdAt: unmarshalled.createdAt,
        completedAt: unmarshalled.completedAt,
      } as DocumentJob;
    });

    return {
      jobs,
      lastEvaluatedKey: response.LastEvaluatedKey,
    };
  } catch (error) {
    log.error('Failed to get user jobs', { error, userId });
    throw new Error(`Failed to get user jobs: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function getJobsByStatus(
  status: DocumentJob['status'],
  limit: number = 50
): Promise<DocumentJob[]> {
  try {
    const response = await dynamoClient.send(
      new QueryCommand({
        TableName: DOCUMENT_JOBS_TABLE,
        IndexName: 'StatusIndex',
        KeyConditionExpression: 'status = :status',
        ExpressionAttributeValues: marshall({
          ':status': status,
        }),
        ScanIndexForward: false, // Get newest first
        Limit: limit,
      })
    );

    return (response.Items || []).map(item => {
      const unmarshalled = unmarshall(item);
      return {
        id: unmarshalled.jobId,
        userId: unmarshalled.userId,
        fileName: unmarshalled.fileName,
        fileSize: unmarshalled.fileSize,
        fileType: unmarshalled.fileType,
        purpose: unmarshalled.purpose,
        processingOptions: unmarshalled.processingOptions,
        status: unmarshalled.status,
        progress: unmarshalled.progress,
        processingStage: unmarshalled.processingStage,
        result: unmarshalled.result,
        resultLocation: unmarshalled.resultLocation,
        resultS3Key: unmarshalled.resultS3Key,
        errorMessage: unmarshalled.errorMessage,
        createdAt: unmarshalled.createdAt,
        completedAt: unmarshalled.completedAt,
      } as DocumentJob;
    });
  } catch (error) {
    log.error('Failed to get jobs by status', { error, status });
    throw new Error(`Failed to get jobs by status: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Helper function to fetch result from S3 if stored there
export async function fetchResultFromS3(s3Key: string): Promise<Record<string, unknown>> {
  try {
    const { S3Client, GetObjectCommand } = await import('@aws-sdk/client-s3');
    const s3Client = new S3Client({});
    
    const bucketName = process.env.DOCUMENTS_BUCKET_NAME;
    if (!bucketName) {
      throw new Error('DOCUMENTS_BUCKET_NAME environment variable not set');
    }

    const response = await s3Client.send(
      new GetObjectCommand({
        Bucket: bucketName,
        Key: s3Key,
      })
    );

    if (!response.Body) {
      throw new Error('Empty response body from S3');
    }

    const bodyText = await response.Body.transformToString();
    return JSON.parse(bodyText);
  } catch (error) {
    log.error('Failed to fetch result from S3', { error, s3Key });
    throw new Error(`Failed to fetch result from S3: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}