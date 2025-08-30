import { SQSEvent, Context } from 'aws-lambda';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { DynamoDBClient, PutItemCommand, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { TextractClient, StartDocumentTextDetectionCommand, GetDocumentTextDetectionCommand } from '@aws-sdk/client-textract';
import { Readable } from 'stream';
import { DocumentProcessorFactory } from './processors/factory';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';

const s3Client = new S3Client({});
const dynamoClient = new DynamoDBClient({});
const sqsClient = new SQSClient({});
const textractClient = new TextractClient({});

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

// Update job status in DynamoDB
async function updateJobStatus(
  jobId: string,
  status: string,
  updates: any = {}
): Promise<void> {
  const timestamp = Date.now();
  const ttl = Math.floor(timestamp / 1000) + 86400 * 7; // 7 days TTL

  try {
    await dynamoClient.send(
      new PutItemCommand({
        TableName: DOCUMENT_JOBS_TABLE,
        Item: marshall({
          jobId,
          timestamp,
          status,
          ttl,
          ...updates,
        }),
      })
    );
    console.log(`Job status updated: ${jobId} -> ${status}`);
  } catch (error) {
    console.error(`Failed to update job status for ${jobId}:`, error);
    throw error;
  }
}

// Get latest job status
async function getJobStatus(jobId: string): Promise<any> {
  try {
    // This is a simplified version - in practice you'd query for the latest timestamp
    const response = await dynamoClient.send(
      new GetItemCommand({
        TableName: DOCUMENT_JOBS_TABLE,
        Key: marshall({ jobId, timestamp: 0 }), // This would need proper querying
      })
    );
    
    return response.Item ? unmarshall(response.Item) : null;
  } catch (error) {
    console.error(`Failed to get job status for ${jobId}:`, error);
    return null;
  }
}

// Store processing results
async function storeResults(jobId: string, result: any): Promise<void> {
  const resultSize = JSON.stringify(result).length;
  
  if (resultSize > 400 * 1024) { // 400KB limit for DynamoDB
    // Store large results in S3
    const resultKey = `results/${jobId}/result.json`;
    
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
  
  console.log(`Sent job ${context.jobId} to high-memory queue`);
}

// Send to DLQ for manual review
async function sendToDLQ(jobId: string, error: any, context: any): Promise<void> {
  if (!DLQ_URL) {
    console.error('DLQ_URL not configured');
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
    
    console.log(`Sent failed job ${jobId} to DLQ`);
  } catch (dlqError) {
    console.error('Failed to send to DLQ:', dlqError);
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
  
  console.log(`Processing document: ${fileName} (${fileSize} bytes, ${fileType})`);
  
  try {
    // Update status to processing
    await updateJobStatus(jobId, 'processing', { 
      processingStage: 'initializing',
      progress: 10,
      startTime: new Date().toISOString(),
    });
    
    // Check if this should be routed to high-memory processor
    if (PROCESSOR_TYPE === 'STANDARD' && fileSize > 50 * 1024 * 1024) {
      console.log(`Routing large file (${fileSize} bytes) to high-memory processor`);
      await sendToHighMemoryQueue(context);
      await updateJobStatus(jobId, 'processing', {
        processingStage: 'routing_to_high_memory',
        progress: 15,
      });
      return;
    }
    
    // Download file from S3
    await updateJobStatus(jobId, 'processing', {
      processingStage: 'downloading',
      progress: 20,
    });
    
    const getObjectCommand = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    });
    
    const response = await s3Client.send(getObjectCommand);
    const stream = response.Body as Readable;
    const buffer = await streamToBuffer(stream);
    
    console.log(`Downloaded ${buffer.length} bytes from S3`);
    
    // Select and configure processor
    await updateJobStatus(jobId, 'processing', {
      processingStage: 'selecting_processor',
      progress: 30,
    });
    
    const processor = DocumentProcessorFactory.create(fileType, {
      enableOCR: processingOptions.ocrEnabled,
      convertToMarkdown: processingOptions.convertToMarkdown,
      extractImages: processingOptions.extractImages,
      generateEmbeddings: processingOptions.generateEmbeddings,
    });
    
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
        });
      },
    });
    
    // Store results
    await updateJobStatus(jobId, 'processing', {
      processingStage: 'storing_results',
      progress: 95,
    });
    
    await storeResults(jobId, result);
    
    console.log(`Successfully processed document: ${fileName}`);
    
  } catch (error) {
    console.error(`Error processing document ${fileName}:`, error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    await updateJobStatus(jobId, 'failed', {
      errorMessage,
      failedAt: new Date().toISOString(),
      processingStage: 'failed',
    });
    
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
        // S3 event notification
        const s3Record = message.Records[0].s3;
        const bucket = s3Record.bucket.name;
        const key = decodeURIComponent(s3Record.object.key.replace(/\+/g, ' '));
        
        // Extract job ID from S3 key pattern: uploads/{jobId}/{fileName}
        const keyParts = key.split('/');
        if (keyParts.length >= 3 && keyParts[0] === 'uploads') {
          const jobId = keyParts[1];
          const fileName = keyParts.slice(2).join('/');
          
          // This would need additional logic to get full context from DynamoDB
          // For now, we'll skip S3-triggered processing in favor of direct SQS messages
          console.log(`Received S3 event for ${key}, but skipping in favor of direct processing`);
        }
      }
    } catch (parseError) {
      console.error('Failed to parse SQS record:', parseError);
    }
  }
  
  return contexts;
}

// Lambda handler
export async function handler(event: SQSEvent, context: Context): Promise<void> {
  console.log(`Received SQS event with ${event.Records.length} records`);
  console.log(`Processor type: ${PROCESSOR_TYPE}`);
  console.log(`Memory: ${context.memoryLimitInMB}MB, Timeout: ${context.getRemainingTimeInMillis()}ms`);
  
  const processingContexts = extractProcessingContexts(event);
  
  if (processingContexts.length === 0) {
    console.log('No valid processing contexts found in event');
    return;
  }
  
  // Process documents concurrently (but limited by Lambda concurrency settings)
  const results = await Promise.allSettled(
    processingContexts.map(ctx => processDocument(ctx))
  );
  
  // Check for failures
  const failures = results.filter(r => r.status === 'rejected') as PromiseRejectedResult[];
  
  if (failures.length > 0) {
    console.error(`${failures.length} documents failed to process:`);
    failures.forEach((failure, index) => {
      console.error(`Document ${index}: ${failure.reason}`);
    });
    
    // If all documents failed, throw to trigger Lambda retry
    if (failures.length === results.length) {
      throw new Error(`All ${failures.length} documents failed to process`);
    }
  }
  
  console.log(`Processed ${results.length - failures.length}/${results.length} documents successfully`);
}