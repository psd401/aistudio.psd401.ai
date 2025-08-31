import { SQSEvent, Context } from 'aws-lambda';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { DynamoDBClient, PutItemCommand, GetItemCommand, QueryCommand } from '@aws-sdk/client-dynamodb';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { Readable } from 'stream';
import { DocumentProcessorFactory } from './processors/factory';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { createLambdaLogger } from './utils/lambda-logger';

const s3Client = new S3Client({});
const dynamoClient = new DynamoDBClient({});
const sqsClient = new SQSClient({});

// Environment variables
const DOCUMENTS_BUCKET = process.env.DOCUMENTS_BUCKET_NAME!;
const DOCUMENT_JOBS_TABLE = process.env.DOCUMENT_JOBS_TABLE!;
const HIGH_MEMORY_QUEUE_URL = process.env.HIGH_MEMORY_QUEUE_URL;
const DLQ_URL = process.env.DLQ_URL;
const PROCESSOR_TYPE = process.env.PROCESSOR_TYPE || 'STANDARD'; // STANDARD or HIGH_MEMORY

interface ProcessingContext {
  jobId: string;
  bucket: string;
  key: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  userId: string;
  processingOptions: {
    extractText: boolean;
    convertToMarkdown: boolean;
    extractImages: boolean;
    generateEmbeddings: boolean;
    ocrEnabled: boolean;
  };
}

// Update job status in DynamoDB - preserving complete job data
async function updateJobStatus(
  jobId: string,
  status: string,
  updates: Record<string, any> = {},
  logger = createLambdaLogger({ operation: 'updateJobStatus' })
): Promise<void> {
  const timestamp = Date.now();
  const ttl = Math.floor(timestamp / 1000) + 86400 * 7; // 7 days TTL

  try {
    // First, get the complete job data from the latest entry
    const existingJobResponse = await dynamoClient.send(
      new QueryCommand({
        TableName: DOCUMENT_JOBS_TABLE,
        KeyConditionExpression: 'jobId = :jobId',
        ExpressionAttributeValues: marshall({
          ':jobId': jobId,
        }),
        ScanIndexForward: false, // Get latest first
        Limit: 1,
      })
    );

    if (!existingJobResponse.Items || existingJobResponse.Items.length === 0) {
      logger.error('No existing job found', { jobId });
      throw new Error(`Job not found: ${jobId}`);
    }

    // Get the existing job data and preserve all fields
    const existingJob = unmarshall(existingJobResponse.Items[0]);
    
    // Create new status entry with complete job data preserved
    await dynamoClient.send(
      new PutItemCommand({
        TableName: DOCUMENT_JOBS_TABLE,
        Item: marshall({
          // Preserve ALL existing job data
          ...existingJob,
          // Update the status and timestamp
          jobId,
          timestamp,
          status,
          ttl,
          // Apply any additional updates
          ...updates,
          // Add completion timestamp if completed
          ...(status === 'completed' && !updates.completedAt && {
            completedAt: new Date().toISOString(),
          }),
        }),
      })
    );
    
    logger.info('Job status updated successfully', { jobId, status, updates });
  } catch (error) {
    logger.error('Failed to update job status', error, { jobId, status });
    throw error;
  }
}

// Store processing results
async function storeResults(jobId: string, result: Record<string, any>): Promise<void> {
  const logger = createLambdaLogger({ operation: 'storeResults', jobId });
  const resultSize = JSON.stringify(result).length;
  
  if (resultSize > 400 * 1024) { // 400KB limit for DynamoDB
    // Store large results in S3
    const resultKey = `v2/results/${jobId}/result.json`;
    
    await s3Client.send(new PutObjectCommand({
      Bucket: DOCUMENTS_BUCKET,
      Key: resultKey,
      Body: JSON.stringify(result),
      ContentType: 'application/json',
    }));
    
    await updateJobStatus(jobId, 'completed', {
      resultLocation: 's3',
      resultS3Key: resultKey,
      completedAt: new Date().toISOString(),
    });
  } else {
    // Store small results directly in DynamoDB
    await updateJobStatus(jobId, 'completed', {
      result,
      completedAt: new Date().toISOString(),
    });
  }
}

// Send to high-memory queue
async function sendToHighMemoryQueue(context: ProcessingContext): Promise<void> {
  if (!HIGH_MEMORY_QUEUE_URL) {
    throw new Error('HIGH_MEMORY_QUEUE_URL not configured');
  }
  
  await sqsClient.send(new SendMessageCommand({
    QueueUrl: HIGH_MEMORY_QUEUE_URL,
    MessageBody: JSON.stringify(context),
  }));
  
  const logger = createLambdaLogger({ operation: 'sendToHighMemoryQueue', jobId: context.jobId });
  logger.info('Job sent to high-memory queue', { jobId: context.jobId, queueUrl: HIGH_MEMORY_QUEUE_URL });
}

// Send to DLQ for manual review
async function sendToDLQ(jobId: string, error: Error | any, context: ProcessingContext): Promise<void> {
  const logger = createLambdaLogger({ operation: 'sendToDLQ', jobId });
  if (!DLQ_URL) {
    logger.error('DLQ_URL not configured');
    return;
  }
  
  try {
    await sqsClient.send(new SendMessageCommand({
      QueueUrl: DLQ_URL,
      MessageBody: JSON.stringify({
        jobId,
        error: {
          message: error.message,
          stack: error.stack,
        },
        context,
        timestamp: new Date().toISOString(),
        processorType: PROCESSOR_TYPE,
      }),
    }));
    
    logger.info('Failed job sent to DLQ', { jobId, processorType: PROCESSOR_TYPE });
  } catch (dlqError) {
    logger.error('Failed to send to DLQ', dlqError);
  }
}

// Stream to buffer converter
async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

// Process a single document
async function processDocument(context: ProcessingContext): Promise<void> {
  const { jobId, bucket, key, fileName, fileSize, fileType, processingOptions } = context;
  const logger = createLambdaLogger({ 
    operation: 'processDocument', 
    jobId, 
    fileName, 
    fileType,
    processorType: PROCESSOR_TYPE
  });
  const timer = logger.startTimer('document-processing');
  
  logger.info('Starting document processing', { 
    fileName, 
    fileSize, 
    fileType, 
    bucket, 
    key, 
    processingOptions 
  });
  
  try {
    // Update status to processing
    await updateJobStatus(jobId, 'processing', { 
      processingStage: 'initializing',
      progress: 10,
      startTime: new Date().toISOString(),
    }, logger);
    
    // Check if this should be routed to high-memory processor
    if (PROCESSOR_TYPE === 'STANDARD' && fileSize > 50 * 1024 * 1024) {
      logger.info('Routing large file to high-memory processor', { 
        fileSize, 
        threshold: 50 * 1024 * 1024 
      });
      await sendToHighMemoryQueue(context);
      await updateJobStatus(jobId, 'processing', {
        processingStage: 'routing_to_high_memory',
        progress: 15,
      }, logger);
      return;
    }
    
    // Download file from S3
    await updateJobStatus(jobId, 'processing', {
      processingStage: 'downloading',
      progress: 20,
    }, logger);
    
    const getObjectCommand = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    });
    
    const response = await s3Client.send(getObjectCommand);
    const stream = response.Body as Readable;
    const buffer = await streamToBuffer(stream);
    
    logger.info('File downloaded from S3', { 
      downloadedBytes: buffer.length, 
      bucket, 
      key 
    });
    
    // Select and configure processor
    await updateJobStatus(jobId, 'processing', {
      processingStage: 'selecting_processor',
      progress: 30,
    }, logger);
    
    const processor = DocumentProcessorFactory.create(fileType, {
      enableOCR: processingOptions.ocrEnabled,
      convertToMarkdown: processingOptions.convertToMarkdown,
      extractImages: processingOptions.extractImages,
      generateEmbeddings: processingOptions.generateEmbeddings,
    }, buffer, fileName);
    
    // Process document with progress callbacks
    const result = await processor.process({
      buffer,
      fileName,
      fileType,
      jobId,
      options: processingOptions,
      onProgress: async (stage: string, progress: number) => {
        await updateJobStatus(jobId, 'processing', { 
          processingStage: stage, 
          progress: Math.max(30, Math.min(95, progress)) // Keep between 30-95%
        }, logger);
      },
    });
    
    // Store results
    await updateJobStatus(jobId, 'processing', {
      processingStage: 'storing_results',
      progress: 95,
    }, logger);
    
    await storeResults(jobId, result);
    
    timer();
    logger.info('Document processing completed successfully', { 
      fileName, 
      fileType,
      resultSize: JSON.stringify(result).length 
    });
    
  } catch (error) {
    timer();
    logger.error('Document processing failed', error, { fileName, fileType });
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    await updateJobStatus(jobId, 'failed', {
      errorMessage,
      failedAt: new Date().toISOString(),
      processingStage: 'failed',
    }, logger);
    
    // Send to DLQ for manual review
    await sendToDLQ(jobId, error, context);
    
    throw error; // Re-throw to let Lambda handle retry logic
  }
}

// Extract processing contexts from SQS events
function extractProcessingContexts(event: SQSEvent): ProcessingContext[] {
  const contexts: ProcessingContext[] = [];
  
  for (const record of event.Records) {
    try {
      const message = JSON.parse(record.body);
      
      // Handle both direct processing messages and S3 event notifications
      if (message.jobId) {
        // Direct processing message
        contexts.push(message as ProcessingContext);
      } else if (message.Records && message.Records[0]?.s3) {
        // S3 event notification - currently not implemented
        // For now, we'll skip S3-triggered processing in favor of direct SQS messages
        const logger = createLambdaLogger({ operation: 'extractProcessingContexts' });
        logger.info('Received S3 event but skipping in favor of direct processing', { 
          eventType: 'S3', 
          objectKey: message.Records[0].s3.object.key 
        });
      }
    } catch (parseError) {
      const logger = createLambdaLogger({ operation: 'extractProcessingContexts' });
      logger.error('Failed to parse SQS record', parseError);
    }
  }
  
  return contexts;
}

// Lambda handler
export async function handler(event: SQSEvent, context: Context): Promise<void> {
  const logger = createLambdaLogger({ 
    operation: 'lambda-handler',
    requestId: context.awsRequestId,
    processorType: PROCESSOR_TYPE
  });
  
  logger.info('Lambda handler invoked', {
    recordCount: event.Records.length,
    processorType: PROCESSOR_TYPE,
    memoryLimit: context.memoryLimitInMB,
    remainingTime: context.getRemainingTimeInMillis()
  });
  
  const processingContexts = extractProcessingContexts(event);
  
  if (processingContexts.length === 0) {
    logger.warn('No valid processing contexts found in event');
    return;
  }
  
  // Process documents concurrently (but limited by Lambda concurrency settings)
  const results = await Promise.allSettled(
    processingContexts.map(ctx => processDocument(ctx))
  );
  
  // Check for failures
  const failures = results.filter(r => r.status === 'rejected') as PromiseRejectedResult[];
  
  if (failures.length > 0) {
    logger.error('Some documents failed to process', {
      failureCount: failures.length,
      totalCount: results.length,
      failures: failures.map((failure, index) => ({
        documentIndex: index,
        reason: failure.reason
      }))
    });
    
    // If all documents failed, throw to trigger Lambda retry
    if (failures.length === results.length) {
      const error = new Error(`All ${failures.length} documents failed to process`);
      logger.error('All documents failed - triggering Lambda retry', error);
      throw error;
    }
  }
  
  logger.info('Lambda execution completed', {
    successCount: results.length - failures.length,
    failureCount: failures.length,
    totalCount: results.length
  });
}