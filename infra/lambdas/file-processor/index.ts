import { SQSEvent, SQSRecord } from 'aws-lambda';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { RDSDataClient, ExecuteStatementCommand, BatchExecuteStatementCommand, SqlParameter } from '@aws-sdk/client-rds-data';
import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { Readable } from 'stream';
import pdfParse from 'pdf-parse';
import * as mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import { parse as csvParse } from 'csv-parse/sync';
import { marked } from 'marked';

const s3Client = new S3Client({});
const rdsClient = new RDSDataClient({});
const dynamoClient = new DynamoDBClient({});

const DOCUMENTS_BUCKET = process.env.DOCUMENTS_BUCKET!;
const JOB_STATUS_TABLE = process.env.JOB_STATUS_TABLE!;
const DATABASE_RESOURCE_ARN = process.env.DATABASE_RESOURCE_ARN!;
const DATABASE_SECRET_ARN = process.env.DATABASE_SECRET_ARN!;
const DATABASE_NAME = process.env.DATABASE_NAME!;

// Helper function to create SQL parameters with proper types
function createSqlParameter(name: string, value: string | number | boolean | null): SqlParameter {
  if (value === null) {
    return { name, value: { isNull: true } };
  }
  if (typeof value === 'string') {
    return { name, value: { stringValue: value } };
  }
  if (typeof value === 'number') {
    return { name, value: { longValue: value } };
  }
  if (typeof value === 'boolean') {
    return { name, value: { booleanValue: value } };
  }
  throw new Error(`Unsupported parameter type for ${name}: ${typeof value}`);
}

interface ProcessingJob {
  jobId: string;
  itemId: number;
  fileKey: string;
  fileName: string;
  fileType: string;
  bucketName: string;
}

interface ChunkData {
  content: string;
  metadata: Record<string, any>;
  chunkIndex: number;
  tokens?: number;
}

// Update job status in DynamoDB
async function updateJobStatus(
  jobId: string,
  status: string,
  details?: any,
  error?: string
) {
  const timestamp = Date.now();
  const ttl = Math.floor(timestamp / 1000) + 86400 * 7; // 7 days TTL

  await dynamoClient.send(
    new PutItemCommand({
      TableName: JOB_STATUS_TABLE,
      Item: {
        jobId: { S: jobId },
        timestamp: { N: timestamp.toString() },
        status: { S: status },
        details: details ? { S: JSON.stringify(details) } : { NULL: true },
        error: error ? { S: error } : { NULL: true },
        ttl: { N: ttl.toString() },
      },
    })
  );
}

// Update repository item status in database
async function updateItemStatus(
  itemId: number,
  status: string,
  error?: string
) {
  const sql = error
    ? `UPDATE repository_items 
       SET processing_status = :status, 
           processing_error = :error,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = :itemId`
    : `UPDATE repository_items 
       SET processing_status = :status,
           processing_error = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = :itemId`;

  const parameters: SqlParameter[] = [
    createSqlParameter('itemId', itemId),
    createSqlParameter('status', status),
  ];

  if (error) {
    parameters.push(createSqlParameter('error', error));
  }

  await rdsClient.send(
    new ExecuteStatementCommand({
      resourceArn: DATABASE_RESOURCE_ARN,
      secretArn: DATABASE_SECRET_ARN,
      database: DATABASE_NAME,
      sql,
      parameters,
    })
  );
}

// Stream to buffer converter
async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

// Text extraction functions for different file types
async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  const data = await pdfParse(buffer);
  return data.text;
}

async function extractTextFromDOCX(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

async function extractTextFromExcel(buffer: Buffer): Promise<string> {
  const workbook = XLSX.read(buffer);
  let text = '';
  
  workbook.SheetNames.forEach((sheetName: string) => {
    const sheet = workbook.Sheets[sheetName];
    const csv = XLSX.utils.sheet_to_csv(sheet);
    text += `\n\n## Sheet: ${sheetName}\n${csv}`;
  });
  
  return text.trim();
}

async function extractTextFromCSV(buffer: Buffer): Promise<string> {
  const records = csvParse(buffer.toString(), {
    columns: true,
    skip_empty_lines: true,
  });
  
  return JSON.stringify(records, null, 2);
}

async function extractTextFromMarkdown(buffer: Buffer): Promise<string> {
  const markdown = buffer.toString();
  // Convert to plain text by removing markdown syntax
  const html = await marked.parse(markdown);
  // Simple HTML to text conversion
  return html.replace(/<[^>]*>/g, '').trim();
}

// Main text extraction dispatcher
async function extractText(buffer: Buffer, fileType: string): Promise<string> {
  const lowerType = fileType.toLowerCase();
  
  if (lowerType.includes('pdf')) {
    return extractTextFromPDF(buffer);
  } else if (lowerType.includes('word') || lowerType.endsWith('.docx')) {
    return extractTextFromDOCX(buffer);
  } else if (lowerType.includes('sheet') || lowerType.endsWith('.xlsx') || lowerType.endsWith('.xls')) {
    return extractTextFromExcel(buffer);
  } else if (lowerType.endsWith('.csv')) {
    return extractTextFromCSV(buffer);
  } else if (lowerType.endsWith('.md') || lowerType.includes('markdown')) {
    return extractTextFromMarkdown(buffer);
  } else if (lowerType.endsWith('.txt') || lowerType.includes('text')) {
    return buffer.toString();
  } else {
    throw new Error(`Unsupported file type: ${fileType}`);
  }
}

// Intelligent text chunking
function chunkText(text: string, maxChunkSize: number = 2000): ChunkData[] {
  const chunks: ChunkData[] = [];
  const lines = text.split('\n');
  let currentChunk = '';
  let chunkIndex = 0;
  
  for (const line of lines) {
    if ((currentChunk + line).length > maxChunkSize && currentChunk.length > 0) {
      chunks.push({
        content: currentChunk.trim(),
        metadata: { lineStart: chunkIndex },
        chunkIndex: chunks.length,
        tokens: Math.ceil(currentChunk.length / 4), // Rough token estimate
      });
      currentChunk = line + '\n';
    } else {
      currentChunk += line + '\n';
    }
  }
  
  if (currentChunk.trim().length > 0) {
    chunks.push({
      content: currentChunk.trim(),
      metadata: { lineStart: chunkIndex },
      chunkIndex: chunks.length,
      tokens: Math.ceil(currentChunk.length / 4),
    });
  }
  
  return chunks;
}

// Store chunks in database
async function storeChunks(itemId: number, chunks: ChunkData[]) {
  if (chunks.length === 0) return;
  
  // First, delete existing chunks for this item
  await rdsClient.send(
    new ExecuteStatementCommand({
      resourceArn: DATABASE_RESOURCE_ARN,
      secretArn: DATABASE_SECRET_ARN,
      database: DATABASE_NAME,
      sql: 'DELETE FROM repository_item_chunks WHERE item_id = :itemId',
      parameters: [createSqlParameter('itemId', itemId)],
    })
  );
  
  // Batch insert new chunks
  const parameterSets: SqlParameter[][] = chunks.map(chunk => [
    createSqlParameter('itemId', itemId),
    createSqlParameter('content', chunk.content),
    createSqlParameter('metadata', JSON.stringify(chunk.metadata)),
    createSqlParameter('chunkIndex', chunk.chunkIndex),
    createSqlParameter('tokens', chunk.tokens ?? null),
  ]);
  
  // BatchExecuteStatement has a limit of 25 parameter sets
  const batchSize = 25;
  for (let i = 0; i < parameterSets.length; i += batchSize) {
    const batch = parameterSets.slice(i, i + batchSize);
    
    await rdsClient.send(
      new BatchExecuteStatementCommand({
        resourceArn: DATABASE_RESOURCE_ARN,
        secretArn: DATABASE_SECRET_ARN,
        database: DATABASE_NAME,
        sql: `INSERT INTO repository_item_chunks 
              (item_id, content, metadata, chunk_index, tokens)
              VALUES (:itemId, :content, :metadata::jsonb, :chunkIndex, :tokens)`,
        parameterSets: batch,
      })
    );
  }
}

// Process a single file
async function processFile(job: ProcessingJob) {
  console.log(`Processing file: ${job.fileName} (${job.fileType})`);
  
  try {
    // Update status to processing
    await updateItemStatus(job.itemId, 'processing');
    await updateJobStatus(job.jobId, 'processing', { fileName: job.fileName });
    
    // Download file from S3
    const getObjectCommand = new GetObjectCommand({
      Bucket: job.bucketName,
      Key: job.fileKey,
    });
    
    const response = await s3Client.send(getObjectCommand);
    const stream = response.Body as Readable;
    const buffer = await streamToBuffer(stream);
    
    // Extract text
    const text = await extractText(buffer, job.fileType);
    
    if (!text || text.trim().length === 0) {
      throw new Error('No text content extracted from file');
    }
    
    // Chunk text
    const chunks = chunkText(text);
    console.log(`Extracted ${chunks.length} chunks from ${job.fileName}`);
    
    // Store chunks
    await storeChunks(job.itemId, chunks);
    
    // Update status to completed
    await updateItemStatus(job.itemId, 'completed');
    await updateJobStatus(job.jobId, 'completed', {
      fileName: job.fileName,
      chunksCreated: chunks.length,
      totalTokens: chunks.reduce((sum, chunk) => sum + (chunk.tokens || 0), 0),
    });
    
  } catch (error) {
    console.error(`Error processing file ${job.fileName}:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    await updateItemStatus(job.itemId, 'failed', errorMessage);
    await updateJobStatus(job.jobId, 'failed', { fileName: job.fileName }, errorMessage);
    
    throw error; // Re-throw to let Lambda handle retry logic
  }
}

// Lambda handler
export async function handler(event: SQSEvent) {
  console.log('Received SQS event:', JSON.stringify(event, null, 2));
  
  for (const record of event.Records) {
    try {
      const job: ProcessingJob = JSON.parse(record.body);
      await processFile(job);
    } catch (error) {
      console.error('Failed to process record:', error);
      // Let the error bubble up so SQS can retry or send to DLQ
      throw error;
    }
  }
}