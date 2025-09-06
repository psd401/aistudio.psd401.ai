"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = handler;
const client_s3_1 = require("@aws-sdk/client-s3");
const client_rds_data_1 = require("@aws-sdk/client-rds-data");
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const client_sqs_1 = require("@aws-sdk/client-sqs");
const client_textract_1 = require("@aws-sdk/client-textract");
const pdf_parse_1 = __importDefault(require("pdf-parse"));
const mammoth = __importStar(require("mammoth"));
const XLSX = __importStar(require("xlsx"));
const sync_1 = require("csv-parse/sync");
const marked_1 = require("marked");
const textract_usage_1 = require("./textract-usage");
const s3Client = new client_s3_1.S3Client({});
const rdsClient = new client_rds_data_1.RDSDataClient({});
const dynamoClient = new client_dynamodb_1.DynamoDBClient({});
const sqsClient = new client_sqs_1.SQSClient({});
const textractClient = new client_textract_1.TextractClient({});
const DOCUMENTS_BUCKET = process.env.DOCUMENTS_BUCKET;
const JOB_STATUS_TABLE = process.env.JOB_STATUS_TABLE;
const DATABASE_RESOURCE_ARN = process.env.DATABASE_RESOURCE_ARN;
const DATABASE_SECRET_ARN = process.env.DATABASE_SECRET_ARN;
const DATABASE_NAME = process.env.DATABASE_NAME;
const EMBEDDING_QUEUE_URL = process.env.EMBEDDING_QUEUE_URL;
const TEXTRACT_SNS_TOPIC_ARN = process.env.TEXTRACT_SNS_TOPIC_ARN;
const TEXTRACT_ROLE_ARN = process.env.TEXTRACT_ROLE_ARN;
// Helper function to create SQL parameters with proper types
function createSqlParameter(name, value) {
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
// Update job status in DynamoDB
async function updateJobStatus(jobId, status, details, error) {
    const timestamp = Date.now();
    const ttl = Math.floor(timestamp / 1000) + 86400 * 7; // 7 days TTL
    await dynamoClient.send(new client_dynamodb_1.PutItemCommand({
        TableName: JOB_STATUS_TABLE,
        Item: {
            jobId: { S: jobId },
            timestamp: { N: timestamp.toString() },
            status: { S: status },
            details: details ? { S: JSON.stringify(details) } : { NULL: true },
            error: error ? { S: error } : { NULL: true },
            ttl: { N: ttl.toString() },
        },
    }));
}
// Start Textract job for PDF OCR
async function startTextractJob(bucketName, fileKey, itemId, fileName, pageCount = 1) {
    try {
        console.log(`Starting Textract job for ${fileName} (${pageCount} pages)`);
        // Check if we have free tier capacity
        const usageTracker = new textract_usage_1.TextractUsageTracker(DATABASE_RESOURCE_ARN, DATABASE_SECRET_ARN, DATABASE_NAME);
        const canProcess = await usageTracker.canProcessPages(pageCount);
        if (!canProcess) {
            const remaining = await usageTracker.getRemainingPages();
            console.warn(`Textract free tier limit would be exceeded. Remaining pages: ${remaining}`);
            throw new Error(`Cannot process ${pageCount} pages. Only ${remaining} pages remaining in free tier this month.`);
        }
        const params = {
            DocumentLocation: {
                S3Object: {
                    Bucket: bucketName,
                    Name: fileKey
                }
            }
        };
        // Add notification if SNS topic is configured
        if (TEXTRACT_SNS_TOPIC_ARN && TEXTRACT_ROLE_ARN) {
            params.NotificationChannel = {
                RoleArn: TEXTRACT_ROLE_ARN,
                SNSTopicArn: TEXTRACT_SNS_TOPIC_ARN
            };
        }
        // Use StartDocumentTextDetection instead of StartDocumentAnalysis to save costs
        // Text detection is cheaper and sufficient for most PDFs
        const response = await textractClient.send(new client_textract_1.StartDocumentTextDetectionCommand(params));
        if (response.JobId) {
            // Store job metadata for later processing
            await rdsClient.send(new client_rds_data_1.ExecuteStatementCommand({
                resourceArn: DATABASE_RESOURCE_ARN,
                secretArn: DATABASE_SECRET_ARN,
                database: DATABASE_NAME,
                sql: `INSERT INTO textract_jobs (job_id, item_id, file_name, created_at)
                VALUES (:jobId, :itemId, :fileName, CURRENT_TIMESTAMP)`,
                parameters: [
                    createSqlParameter('jobId', response.JobId),
                    createSqlParameter('itemId', itemId),
                    createSqlParameter('fileName', fileName)
                ]
            }));
            console.log(`Textract job started with ID: ${response.JobId}`);
            // Record usage
            await usageTracker.recordUsage(pageCount);
            return response.JobId;
        }
        return null;
    }
    catch (error) {
        console.error('Error starting Textract job:', error);
        return null;
    }
}
// Update repository item status in database
async function updateItemStatus(itemId, status, error) {
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
    const parameters = [
        createSqlParameter('itemId', itemId),
        createSqlParameter('status', status),
    ];
    if (error) {
        parameters.push(createSqlParameter('error', error));
    }
    await rdsClient.send(new client_rds_data_1.ExecuteStatementCommand({
        resourceArn: DATABASE_RESOURCE_ARN,
        secretArn: DATABASE_SECRET_ARN,
        database: DATABASE_NAME,
        sql,
        parameters,
    }));
}
// Stream to buffer converter
async function streamToBuffer(stream) {
    const chunks = [];
    for await (const chunk of stream) {
        chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
}
async function extractTextFromPDF(buffer) {
    try {
        console.log(`Attempting to parse PDF, buffer size: ${buffer.length} bytes`);
        // Try parsing the PDF
        const data = await (0, pdf_parse_1.default)(buffer);
        console.log(`PDF parsed successfully, text length: ${data.text?.length || 0} characters`);
        console.log(`PDF info - pages: ${data.numpages}, version: ${data.version}`);
        const pageCount = data.numpages || 1;
        // If no text extracted, it might be a scanned PDF
        if (!data.text || data.text.trim().length === 0) {
            console.warn('No text found in PDF - it might be a scanned image PDF');
            // Return null to indicate OCR is needed
            return { text: null, pageCount };
        }
        // Also check if extracted text is suspiciously short for the number of pages
        const avgCharsPerPage = data.text.length / pageCount;
        if (avgCharsPerPage < 100 && pageCount > 1) {
            console.warn(`Suspiciously low text content: ${avgCharsPerPage} chars/page for ${pageCount} pages`);
            return { text: null, pageCount };
        }
        return { text: data.text, pageCount };
    }
    catch (error) {
        console.error('PDF parsing error:', error);
        // Try a more basic extraction as fallback
        try {
            const basicData = await (0, pdf_parse_1.default)(buffer);
            if (basicData.text) {
                console.log('Basic extraction succeeded');
                return { text: basicData.text, pageCount: basicData.numpages || 1 };
            }
        }
        catch (fallbackError) {
            console.error('Fallback PDF parsing also failed:', fallbackError);
        }
        // Return null text to trigger OCR
        console.error(`Failed to parse PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
        return { text: null, pageCount: 1 };
    }
}
async function extractTextFromDOCX(buffer) {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
}
async function extractTextFromExcel(buffer) {
    const workbook = XLSX.read(buffer);
    let text = '';
    workbook.SheetNames.forEach((sheetName) => {
        const sheet = workbook.Sheets[sheetName];
        const csv = XLSX.utils.sheet_to_csv(sheet);
        text += `\n\n## Sheet: ${sheetName}\n${csv}`;
    });
    return text.trim();
}
async function extractTextFromCSV(buffer) {
    const records = (0, sync_1.parse)(buffer.toString(), {
        columns: true,
        skip_empty_lines: true,
    });
    return JSON.stringify(records, null, 2);
}
async function extractTextFromMarkdown(buffer) {
    const markdown = buffer.toString();
    // Convert to plain text by removing markdown syntax
    const html = await marked_1.marked.parse(markdown);
    // Simple HTML to text conversion
    return html.replace(/<[^>]*>/g, '').trim();
}
// Main text extraction dispatcher
async function extractText(buffer, fileType) {
    const lowerType = fileType.toLowerCase();
    if (lowerType.includes('pdf')) {
        return extractTextFromPDF(buffer);
    }
    else if (lowerType.includes('word') || lowerType.endsWith('.docx')) {
        const text = await extractTextFromDOCX(buffer);
        return { text };
    }
    else if (lowerType.includes('sheet') || lowerType.endsWith('.xlsx') || lowerType.endsWith('.xls')) {
        const text = await extractTextFromExcel(buffer);
        return { text };
    }
    else if (lowerType.endsWith('.csv')) {
        const text = await extractTextFromCSV(buffer);
        return { text };
    }
    else if (lowerType.endsWith('.md') || lowerType.includes('markdown')) {
        const text = await extractTextFromMarkdown(buffer);
        return { text };
    }
    else if (lowerType.endsWith('.txt') || lowerType.includes('text')) {
        return { text: buffer.toString() };
    }
    else {
        throw new Error(`Unsupported file type: ${fileType}`);
    }
}
// Intelligent text chunking
function chunkText(text, maxChunkSize = 2000) {
    const chunks = [];
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
        }
        else {
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
// Store chunks in database and return chunk IDs
async function storeChunks(itemId, chunks) {
    if (chunks.length === 0)
        return { chunkIds: [], texts: [] };
    // First, delete existing chunks for this item
    await rdsClient.send(new client_rds_data_1.ExecuteStatementCommand({
        resourceArn: DATABASE_RESOURCE_ARN,
        secretArn: DATABASE_SECRET_ARN,
        database: DATABASE_NAME,
        sql: 'DELETE FROM repository_item_chunks WHERE item_id = :itemId',
        parameters: [createSqlParameter('itemId', itemId)],
    }));
    const chunkIds = [];
    const texts = [];
    // Batch insert new chunks
    const parameterSets = chunks.map(chunk => [
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
        const batchChunks = chunks.slice(i, i + batchSize);
        await rdsClient.send(new client_rds_data_1.BatchExecuteStatementCommand({
            resourceArn: DATABASE_RESOURCE_ARN,
            secretArn: DATABASE_SECRET_ARN,
            database: DATABASE_NAME,
            sql: `INSERT INTO repository_item_chunks 
              (item_id, content, metadata, chunk_index, tokens)
              VALUES (:itemId, :content, :metadata::jsonb, :chunkIndex, :tokens)`,
            parameterSets: batch,
        }));
        // BatchExecuteStatement doesn't support RETURNING, so query for the IDs
        const chunkResult = await rdsClient.send(new client_rds_data_1.ExecuteStatementCommand({
            resourceArn: DATABASE_RESOURCE_ARN,
            secretArn: DATABASE_SECRET_ARN,
            database: DATABASE_NAME,
            sql: `SELECT id, content FROM repository_item_chunks 
              WHERE item_id = :itemId 
              AND chunk_index >= :startIndex 
              AND chunk_index < :endIndex
              ORDER BY chunk_index`,
            parameters: [
                createSqlParameter('itemId', itemId),
                createSqlParameter('startIndex', i),
                createSqlParameter('endIndex', i + batch.length)
            ]
        }));
        if (chunkResult.records) {
            chunkResult.records.forEach(record => {
                if (record[0]?.longValue && record[1]?.stringValue) {
                    chunkIds.push(record[0].longValue);
                    texts.push(record[1].stringValue);
                }
            });
        }
    }
    return { chunkIds, texts };
}
// Process a single file
async function processFile(job) {
    console.log(`Processing file: ${job.fileName} (${job.fileType})`);
    try {
        // Update status to processing
        await updateItemStatus(job.itemId, 'processing');
        await updateJobStatus(job.jobId, 'processing', { fileName: job.fileName });
        // Download file from S3
        const getObjectCommand = new client_s3_1.GetObjectCommand({
            Bucket: job.bucketName,
            Key: job.fileKey,
        });
        console.log(`Downloading from S3: ${job.bucketName}/${job.fileKey}`);
        const response = await s3Client.send(getObjectCommand);
        const stream = response.Body;
        const buffer = await streamToBuffer(stream);
        console.log(`Downloaded ${buffer.length} bytes from S3`);
        // Extract text
        const extractionResult = await extractText(buffer, job.fileType);
        let text = extractionResult.text;
        // Check if this is a PDF that needs OCR
        if (text === null && job.fileType.toLowerCase().includes('pdf')) {
            console.log('PDF needs OCR processing, starting Textract job...');
            // Use page count from extraction result
            const pageCount = extractionResult.pageCount || 1;
            const textractJobId = await startTextractJob(job.bucketName, job.fileKey, job.itemId, job.fileName, pageCount);
            if (textractJobId) {
                // Update status to indicate OCR processing
                await updateItemStatus(job.itemId, 'processing_ocr');
                await updateJobStatus(job.jobId, 'ocr_processing', {
                    fileName: job.fileName,
                    textractJobId
                });
                // Exit early - Textract will handle the rest via SNS
                console.log('File queued for OCR processing');
                return;
            }
            else {
                throw new Error('Failed to start Textract job for OCR processing');
            }
        }
        if (!text || text.trim().length === 0) {
            throw new Error('No text content extracted from file');
        }
        // Chunk text
        const chunks = chunkText(text);
        console.log(`Extracted ${chunks.length} chunks from ${job.fileName}`);
        // Store chunks and get their IDs
        const { chunkIds, texts } = await storeChunks(job.itemId, chunks);
        // Queue embeddings if enabled and chunks were created
        if (EMBEDDING_QUEUE_URL && chunkIds.length > 0) {
            try {
                await sqsClient.send(new client_sqs_1.SendMessageCommand({
                    QueueUrl: EMBEDDING_QUEUE_URL,
                    MessageBody: JSON.stringify({
                        itemId: job.itemId,
                        chunkIds,
                        texts
                    })
                }));
                console.log(`Successfully queued ${chunkIds.length} chunks for embedding generation`);
                // Update status to indicate embeddings are being processed
                await updateItemStatus(job.itemId, 'processing_embeddings');
            }
            catch (error) {
                console.error('Failed to queue embeddings:', error);
                // Don't fail the whole job if embedding queueing fails
                await updateItemStatus(job.itemId, 'completed');
            }
        }
        else {
            // Update status to completed if no embedding queue configured
            await updateItemStatus(job.itemId, 'completed');
        }
        await updateJobStatus(job.jobId, 'completed', {
            fileName: job.fileName,
            chunksCreated: chunks.length,
            totalTokens: chunks.reduce((sum, chunk) => sum + (chunk.tokens || 0), 0),
        });
    }
    catch (error) {
        console.error(`Error processing file ${job.fileName}:`, error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        await updateItemStatus(job.itemId, 'failed', errorMessage);
        await updateJobStatus(job.jobId, 'failed', { fileName: job.fileName }, errorMessage);
        throw error; // Re-throw to let Lambda handle retry logic
    }
}
// Validate S3 key to prevent path traversal attacks
function validateS3Key(key) {
    // Reject keys with path traversal patterns
    if (key.includes('../') || key.includes('..\\') || key.startsWith('/')) {
        return false;
    }
    // Accept two valid patterns:
    // 1. New format: repositories/{repoId}/{itemId}/{filename}
    // 2. Legacy format: {userId}/{timestamp}-{filename}
    const newFormatPattern = /^repositories\/\d+\/\d+\/[^/]+$/;
    const legacyFormatPattern = /^\d+\/\d+-[^/]+$/;
    return newFormatPattern.test(key) || legacyFormatPattern.test(key);
}
// Lambda handler
async function handler(event) {
    console.log('Received SQS event:', JSON.stringify(event, null, 2));
    for (const record of event.Records) {
        try {
            const job = JSON.parse(record.body);
            // Validate file key before processing
            if (!validateS3Key(job.fileKey)) {
                console.error(`Invalid S3 key detected: ${job.fileKey}`);
                throw new Error(`Invalid S3 key: ${job.fileKey}`);
            }
            await processFile(job);
        }
        catch (error) {
            console.error('Failed to process record:', error);
            // Let the error bubble up so SQS can retry or send to DLQ
            throw error;
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQXFqQkEsMEJBb0JDO0FBeGtCRCxrREFBZ0U7QUFDaEUsOERBQThIO0FBQzlILDhEQUEwRTtBQUMxRSxvREFBb0U7QUFDcEUsOERBQTJIO0FBRTNILDBEQUFpQztBQUNqQyxpREFBbUM7QUFDbkMsMkNBQTZCO0FBQzdCLHlDQUFtRDtBQUNuRCxtQ0FBZ0M7QUFDaEMscURBQXdEO0FBRXhELE1BQU0sUUFBUSxHQUFHLElBQUksb0JBQVEsQ0FBQyxFQUFFLENBQUMsQ0FBQztBQUNsQyxNQUFNLFNBQVMsR0FBRyxJQUFJLCtCQUFhLENBQUMsRUFBRSxDQUFDLENBQUM7QUFDeEMsTUFBTSxZQUFZLEdBQUcsSUFBSSxnQ0FBYyxDQUFDLEVBQUUsQ0FBQyxDQUFDO0FBQzVDLE1BQU0sU0FBUyxHQUFHLElBQUksc0JBQVMsQ0FBQyxFQUFFLENBQUMsQ0FBQztBQUNwQyxNQUFNLGNBQWMsR0FBRyxJQUFJLGdDQUFjLENBQUMsRUFBRSxDQUFDLENBQUM7QUFFOUMsTUFBTSxnQkFBZ0IsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLGdCQUFpQixDQUFDO0FBQ3ZELE1BQU0sZ0JBQWdCLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxnQkFBaUIsQ0FBQztBQUN2RCxNQUFNLHFCQUFxQixHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMscUJBQXNCLENBQUM7QUFDakUsTUFBTSxtQkFBbUIsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLG1CQUFvQixDQUFDO0FBQzdELE1BQU0sYUFBYSxHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsYUFBYyxDQUFDO0FBQ2pELE1BQU0sbUJBQW1CLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxtQkFBbUIsQ0FBQztBQUM1RCxNQUFNLHNCQUFzQixHQUFHLE9B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O0FBQ1YsS0FBSyxVQUFVLE9BQU8sQ0FBQyxLQUFlO0lBQzNDLE9BQU8sQ0FBQyxHQUFHLENBQUMscUJBQXFCLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxLQUFLLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFFbkUsS0FBSyxNQUFNLE1BQU0sSUFBSSxLQUFLLENBQUMsT0FBTyxFQUFFLENBQUM7UUFDbkMsSUFBSSxDQUFDO1lBQ0gsTUFBTSxHQUFHLEdBQWtCLElBQUksQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDO1lBRW5ELHNDQUFzQztZQUN0QyxJQUFJLENBQUMsYUFBYSxDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO2dCQUNoQyxPQUFPLENBQUMsS0FBSyxDQUFDLDRCQUE0QixHQUFHLENBQUMsT0FBTyxFQUFFLENBQUMsQ0FBQztnQkFDekQsTUFBTSxJQUFJLEtBQUssQ0FBQyxtQkFBbUIsR0FBRyxDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUM7WUFDcEQsQ0FBQztZQUVELE1BQU0sV0FBVyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ3pCLENBQUM7UUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1lBQ2YsT0FBTyxDQUFDLEtBQUssQ0FBQywyQkFBMkIsRUFBRSxLQUFLLENBQUMsQ0FBQztZQUNsRCwwREFBMEQ7WUFDMUQsTUFBTSxLQUFLLENBQUM7UUFDZCxDQUFDO0lBQ0gsQ0FBQztBQUNILENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBTUVNFdmVudCwgU1FTUmVjb3JkIH0gZnJvbSAnYXdzLWxhbWJkYSc7XG5pbXBvcnQgeyBTM0NsaWVudCwgR2V0T2JqZWN0Q29tbWFuZCB9IGZyb20gJ0Bhd3Mtc2RrL2NsaWVudC1zMyc7XG5pbXBvcnQgeyBSRFNEYXRhQ2xpZW50LCBFeGVjdXRlU3RhdGVtZW50Q29tbWFuZCwgQmF0Y2hFeGVjdXRlU3RhdGVtZW50Q29tbWFuZCwgU3FsUGFyYW1ldGVyIH0gZnJvbSAnQGF3cy1zZGsvY2xpZW50LXJkcy1kYXRhJztcbmltcG9ydCB7IER5bmFtb0RCQ2xpZW50LCBQdXRJdGVtQ29tbWFuZCB9IGZyb20gJ0Bhd3Mtc2RrL2NsaWVudC1keW5hbW9kYic7XG5pbXBvcnQgeyBTUVNDbGllbnQsIFNlbmRNZXNzYWdlQ29tbWFuZCB9IGZyb20gJ0Bhd3Mtc2RrL2NsaWVudC1zcXMnO1xuaW1wb3J0IHsgVGV4dHJhY3RDbGllbnQsIFN0YXJ0RG9jdW1lbnRBbmFseXNpc0NvbW1hbmQsIFN0YXJ0RG9jdW1lbnRUZXh0RGV0ZWN0aW9uQ29tbWFuZCB9IGZyb20gJ0Bhd3Mtc2RrL2NsaWVudC10ZXh0cmFjdCc7XG5pbXBvcnQgeyBSZWFkYWJsZSB9IGZyb20gJ3N0cmVhbSc7XG5pbXBvcnQgcGRmUGFyc2UgZnJvbSAncGRmLXBhcnNlJztcbmltcG9ydCAqIGFzIG1hbW1vdGggZnJvbSAnbWFtbW90aCc7XG5pbXBvcnQgKiBhcyBYTFNYIGZyb20gJ3hsc3gnO1xuaW1wb3J0IHsgcGFyc2UgYXMgY3N2UGFyc2UgfSBmcm9tICdjc3YtcGFyc2Uvc3luYyc7XG5pbXBvcnQgeyBtYXJrZWQgfSBmcm9tICdtYXJrZWQnO1xuaW1wb3J0IHsgVGV4dHJhY3RVc2FnZVRyYWNrZXIgfSBmcm9tICcuL3RleHRyYWN0LXVzYWdlJztcblxuY29uc3QgczNDbGllbnQgPSBuZXcgUzNDbGllbnQoe30pO1xuY29uc3QgcmRzQ2xpZW50ID0gbmV3IFJEU0RhdGFDbGllbnQoe30pO1xuY29uc3QgZHluYW1vQ2xpZW50ID0gbmV3IER5bmFtb0RCQ2xpZW50KHt9KTtcbmNvbnN0IHNxc0NsaWVudCA9IG5ldyBTUVNDbGllbnQoe30pO1xuY29uc3QgdGV4dHJhY3RDbGllbnQgPSBuZXcgVGV4dHJhY3RDbGllbnQoe30pO1xuXG5jb25zdCBET0NVTUVOVFNfQlVDS0VUID0gcHJvY2Vzcy5lbnYuRE9DVU1FTlRTX0JVQ0tFVCE7XG5jb25zdCBKT0JfU1RBVFVTX1RBQkxFID0gcHJvY2Vzcy5lbnYuSk9CX1NUQVRVU19UQUJMRSE7XG5jb25zdCBEQVRBQkFTRV9SRVNPVVJDRV9BUk4gPSBwcm9jZXNzLmVudi5EQVRBQkFTRV9SRVNPVVJDRV9BUk4hO1xuY29uc3QgREFUQUJBU0VfU0VDUkVUX0FSTiA9IHByb2Nlc3MuZW52LkRBVEFCQVNFX1NFQ1JFVF9BUk4hO1xuY29uc3QgREFUQUJBU0VfTkFNRSA9IHByb2Nlc3MuZW52LkRBVEFCQVNFX05BTUUhO1xuY29uc3QgRU1CRURESU5HX1FVRVVFX1VSTCA9IHByb2Nlc3MuZW52LkVNQkVERElOR19RVUVVRV9VUkw7XG5jb25zdCBURVhUUkFDVF9TTlNfVE9QSUNfQVJOID0gcHJvY2Vzcy5lbnYuVEVYVFJBQ1RfU05TX1RPUElDX0FSTjtcbmNvbnN0IFRFWFRSQUNUX1JPTEVfQVJOID0gcHJvY2Vzcy5lbnYuVEVYVFJBQ1RfUk9MRV9BUk47XG5cbi8vIEhlbHBlciBmdW5jdGlvbiB0byBjcmVhdGUgU1FMIHBhcmFtZXRlcnMgd2l0aCBwcm9wZXIgdHlwZXNcbmZ1bmN0aW9uIGNyZWF0ZVNxbFBhcmFtZXRlcihuYW1lOiBzdHJpbmcsIHZhbHVlOiBzdHJpbmcgfCBudW1iZXIgfCBib29sZWFuIHwgbnVsbCk6IFNxbFBhcmFtZXRlciB7XG4gIGlmICh2YWx1ZSA9PT0gbnVsbCkge1xuICAgIHJldHVybiB7IG5hbWUsIHZhbHVlOiB7IGlzTnVsbDogdHJ1ZSB9IH07XG4gIH1cbiAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICByZXR1cm4geyBuYW1lLCB2YWx1ZTogeyBzdHJpbmdWYWx1ZTogdmFsdWUgfSB9O1xuICB9XG4gIGlmICh0eXBlb2YgdmFsdWUgPT09ICdudW1iZXInKSB7XG4gICAgcmV0dXJuIHsgbmFtZSwgdmFsdWU6IHsgbG9uZ1ZhbHVlOiB2YWx1ZSB9IH07XG4gIH1cbiAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ2Jvb2xlYW4nKSB7XG4gICAgcmV0dXJuIHsgbmFtZSwgdmFsdWU6IHsgYm9vbGVhblZhbHVlOiB2YWx1ZSB9IH07XG4gIH1cbiAgdGhyb3cgbmV3IEVycm9yKGBVbnN1cHBvcnRlZCBwYXJhbWV0ZXIgdHlwZSBmb3IgJHtuYW1lfTogJHt0eXBlb2YgdmFsdWV9YCk7XG59XG5cbmludGVyZmFjZSBQcm9jZXNzaW5nSm9iIHtcbiAgam9iSWQ6IHN0cmluZztcbiAgaXRlbUlkOiBudW1iZXI7XG4gIGZpbGVLZXk6IHN0cmluZztcbiAgZmlsZU5hbWU6IHN0cmluZztcbiAgZmlsZVR5cGU6IHN0cmluZztcbiAgYnVja2V0TmFtZTogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgQ2h1bmtEYXRhIHtcbiAgY29udGVudDogc3RyaW5nO1xuICBtZXRhZGF0YTogUmVjb3JkPHN0cmluZywgYW55PjtcbiAgY2h1bmtJbmRleDogbnVtYmVyO1xuICB0b2tlbnM/OiBudW1iZXI7XG59XG5cbi8vIFVwZGF0ZSBqb2Igc3RhdHVzIGluIER5bmFtb0RCXG5hc3luYyBmdW5jdGlvbiB1cGRhdGVKb2JTdGF0dXMoXG4gIGpvYklkOiBzdHJpbmcsXG4gIHN0YXR1czogc3RyaW5nLFxuICBkZXRhaWxzPzogYW55LFxuICBlcnJvcj86IHN0cmluZ1xuKSB7XG4gIGNvbnN0IHRpbWVzdGFtcCA9IERhdGUubm93KCk7XG4gIGNvbnN0IHR0bCA9IE1hdGguZmxvb3IodGltZXN0YW1wIC8gMTAwMCkgKyA4NjQwMCAqIDc7IC8vIDcgZGF5cyBUVExcblxuICBhd2FpdCBkeW5hbW9DbGllbnQuc2VuZChcbiAgICBuZXcgUHV0SXRlbUNvbW1hbmQoe1xuICAgICAgVGFibGVOYW1lOiBKT0JfU1RBVFVTX1RBQkxFLFxuICAgICAgSXRlbToge1xuICAgICAgICBqb2JJZDogeyBTOiBqb2JJZCB9LFxuICAgICAgICB0aW1lc3RhbXA6IHsgTjogdGltZXN0YW1wLnRvU3RyaW5nKCkgfSxcbiAgICAgICAgc3RhdHVzOiB7IFM6IHN0YXR1cyB9LFxuICAgICAgICBkZXRhaWxzOiBkZXRhaWxzID8geyBTOiBKU09OLnN0cmluZ2lmeShkZXRhaWxzKSB9IDogeyBOVUxMOiB0cnVlIH0sXG4gICAgICAgIGVycm9yOiBlcnJvciA/IHsgUzogZXJyb3IgfSA6IHsgTlVMTDogdHJ1ZSB9LFxuICAgICAgICB0dGw6IHsgTjogdHRsLnRvU3RyaW5nKCkgfSxcbiAgICAgIH0sXG4gICAgfSlcbiAgKTtcbn1cblxuLy8gU3RhcnQgVGV4dHJhY3Qgam9iIGZvciBQREYgT0NSXG5hc3luYyBmdW5jdGlvbiBzdGFydFRleHRyYWN0Sm9iKFxuICBidWNrZXROYW1lOiBzdHJpbmcsXG4gIGZpbGVLZXk6IHN0cmluZyxcbiAgaXRlbUlkOiBudW1iZXIsXG4gIGZpbGVOYW1lOiBzdHJpbmcsXG4gIHBhZ2VDb3VudDogbnVtYmVyID0gMVxuKTogUHJvbWlzZTxzdHJpbmcgfCBudWxsPiB7XG4gIHRyeSB7XG4gICAgY29uc29sZS5sb2coYFN0YXJ0aW5nIFRleHRyYWN0IGpvYiBmb3IgJHtmaWxlTmFtZX0gKCR7cGFnZUNvdW50fSBwYWdlcylgKTtcbiAgICBcbiAgICAvLyBDaGVjayBpZiB3ZSBoYXZlIGZyZWUgdGllciBjYXBhY2l0eVxuICAgIGNvbnN0IHVzYWdlVHJhY2tlciA9IG5ldyBUZXh0cmFjdFVzYWdlVHJhY2tlcihcbiAgICAgIERBVEFCQVNFX1JFU09VUkNFX0FSTixcbiAgICAgIERBVEFCQVNFX1NFQ1JFVF9BUk4sXG4gICAgICBEQVRBQkFTRV9OQU1FXG4gICAgKTtcbiAgICBcbiAgICBjb25zdCBjYW5Qcm9jZXNzID0gYXdhaXQgdXNhZ2VUcmFja2VyLmNhblByb2Nlc3NQYWdlcyhwYWdlQ291bnQpO1xuICAgIGlmICghY2FuUHJvY2Vzcykge1xuICAgICAgY29uc3QgcmVtYWluaW5nID0gYXdhaXQgdXNhZ2VUcmFja2VyLmdldFJlbWFpbmluZ1BhZ2VzKCk7XG4gICAgICBjb25zb2xlLndhcm4oYFRleHRyYWN0IGZyZWUgdGllciBsaW1pdCB3b3VsZCBiZSBleGNlZWRlZC4gUmVtYWluaW5nIHBhZ2VzOiAke3JlbWFpbmluZ31gKTtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgQ2Fubm90IHByb2Nlc3MgJHtwYWdlQ291bnR9IHBhZ2VzLiBPbmx5ICR7cmVtYWluaW5nfSBwYWdlcyByZW1haW5pbmcgaW4gZnJlZSB0aWVyIHRoaXMgbW9udGguYCk7XG4gICAgfVxuICAgIFxuICAgIGNvbnN0IHBhcmFtcyA9IHtcbiAgICAgIERvY3VtZW50TG9jYXRpb246IHtcbiAgICAgICAgUzNPYmplY3Q6IHtcbiAgICAgICAgICBCdWNrZXQ6IGJ1Y2tldE5hbWUsXG4gICAgICAgICAgTmFtZTogZmlsZUtleVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfTtcblxuICAgIC8vIEFkZCBub3RpZmljYXRpb24gaWYgU05TIHRvcGljIGlzIGNvbmZpZ3VyZWRcbiAgICBpZiAoVEVYVFJBQ1RfU05TX1RPUElDX0FSTiAmJiBURVhUUkFDVF9ST0xFX0FSTikge1xuICAgICAgKHBhcmFtcyBhcyBhbnkpLk5vdGlmaWNhdGlvbkNoYW5uZWwgPSB7XG4gICAgICAgIFJvbGVBcm46IFRFWFRSQUNUX1JPTEVfQVJOLFxuICAgICAgICBTTlNUb3BpY0FybjogVEVYVFJBQ1RfU05TX1RPUElDX0FSTlxuICAgICAgfTtcbiAgICB9XG5cbiAgICAvLyBVc2UgU3RhcnREb2N1bWVudFRleHREZXRlY3Rpb24gaW5zdGVhZCBvZiBTdGFydERvY3VtZW50QW5hbHlzaXMgdG8gc2F2ZSBjb3N0c1xuICAgIC8vIFRleHQgZGV0ZWN0aW9uIGlzIGNoZWFwZXIgYW5kIHN1ZmZpY2llbnQgZm9yIG1vc3QgUERGc1xuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGV4dHJhY3RDbGllbnQuc2VuZChuZXcgU3RhcnREb2N1bWVudFRleHREZXRlY3Rpb25Db21tYW5kKHBhcmFtcykpO1xuICAgIFxuICAgIGlmIChyZXNwb25zZS5Kb2JJZCkge1xuICAgICAgLy8gU3RvcmUgam9iIG1ldGFkYXRhIGZvciBsYXRlciBwcm9jZXNzaW5nXG4gICAgICBhd2FpdCByZHNDbGllbnQuc2VuZChcbiAgICAgICAgbmV3IEV4ZWN1dGVTdGF0ZW1lbnRDb21tYW5kKHtcbiAgICAgICAgICByZXNvdXJjZUFybjogREFUQUJBU0VfUkVTT1VSQ0VfQVJOLFxuICAgICAgICAgIHNlY3JldEFybjogREFUQUJBU0VfU0VDUkVUX0FSTixcbiAgICAgICAgICBkYXRhYmFzZTogREFUQUJBU0VfTkFNRSxcbiAgICAgICAgICBzcWw6IGBJTlNFUlQgSU5UTyB0ZXh0cmFjdF9qb2JzIChqb2JfaWQsIGl0ZW1faWQsIGZpbGVfbmFtZSwgY3JlYXRlZF9hdClcbiAgICAgICAgICAgICAgICBWQUxVRVMgKDpqb2JJZCwgOml0ZW1JZCwgOmZpbGVOYW1lLCBDVVJSRU5UX1RJTUVTVEFNUClgLFxuICAgICAgICAgIHBhcmFtZXRlcnM6IFtcbiAgICAgICAgICAgIGNyZWF0ZVNxbFBhcmFtZXRlcignam9iSWQnLCByZXNwb25zZS5Kb2JJZCksXG4gICAgICAgICAgICBjcmVhdGVTcWxQYXJhbWV0ZXIoJ2l0ZW1JZCcsIGl0ZW1JZCksXG4gICAgICAgICAgICBjcmVhdGVTcWxQYXJhbWV0ZXIoJ2ZpbGVOYW1lJywgZmlsZU5hbWUpXG4gICAgICAgICAgXVxuICAgICAgICB9KVxuICAgICAgKTtcbiAgICAgIFxuICAgICAgY29uc29sZS5sb2coYFRleHRyYWN0IGpvYiBzdGFydGVkIHdpdGggSUQ6ICR7cmVzcG9uc2UuSm9iSWR9YCk7XG4gICAgICBcbiAgICAgIC8vIFJlY29yZCB1c2FnZVxuICAgICAgYXdhaXQgdXNhZ2VUcmFja2VyLnJlY29yZFVzYWdlKHBhZ2VDb3VudCk7XG4gICAgICBcbiAgICAgIHJldHVybiByZXNwb25zZS5Kb2JJZDtcbiAgICB9XG4gICAgXG4gICAgcmV0dXJuIG51bGw7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcignRXJyb3Igc3RhcnRpbmcgVGV4dHJhY3Qgam9iOicsIGVycm9yKTtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxufVxuXG4vLyBVcGRhdGUgcmVwb3NpdG9yeSBpdGVtIHN0YXR1cyBpbiBkYXRhYmFzZVxuYXN5bmMgZnVuY3Rpb24gdXBkYXRlSXRlbVN0YXR1cyhcbiAgaXRlbUlkOiBudW1iZXIsXG4gIHN0YXR1czogc3RyaW5nLFxuICBlcnJvcj86IHN0cmluZ1xuKSB7XG4gIGNvbnN0IHNxbCA9IGVycm9yXG4gICAgPyBgVVBEQVRFIHJlcG9zaXRvcnlfaXRlbXMgXG4gICAgICAgU0VUIHByb2Nlc3Npbmdfc3RhdHVzID0gOnN0YXR1cywgXG4gICAgICAgICAgIHByb2Nlc3NpbmdfZXJyb3IgPSA6ZXJyb3IsXG4gICAgICAgICAgIHVwZGF0ZWRfYXQgPSBDVVJSRU5UX1RJTUVTVEFNUFxuICAgICAgIFdIRVJFIGlkID0gOml0ZW1JZGBcbiAgICA6IGBVUERBVEUgcmVwb3NpdG9yeV9pdGVtcyBcbiAgICAgICBTRVQgcHJvY2Vzc2luZ19zdGF0dXMgPSA6c3RhdHVzLFxuICAgICAgICAgICBwcm9jZXNzaW5nX2Vycm9yID0gTlVMTCxcbiAgICAgICAgICAgdXBkYXRlZF9hdCA9IENVUlJFTlRfVElNRVNUQU1QXG4gICAgICAgV0hFUkUgaWQgPSA6aXRlbUlkYDtcblxuICBjb25zdCBwYXJhbWV0ZXJzOiBTcWxQYXJhbWV0ZXJbXSA9IFtcbiAgICBjcmVhdGVTcWxQYXJhbWV0ZXIoJ2l0ZW1JZCcsIGl0ZW1JZCksXG4gICAgY3JlYXRlU3FsUGFyYW1ldGVyKCdzdGF0dXMnLCBzdGF0dXMpLFxuICBdO1xuXG4gIGlmIChlcnJvcikge1xuICAgIHBhcmFtZXRlcnMucHVzaChjcmVhdGVTcWxQYXJhbWV0ZXIoJ2Vycm9yJywgZXJyb3IpKTtcbiAgfVxuXG4gIGF3YWl0IHJkc0NsaWVudC5zZW5kKFxuICAgIG5ldyBFeGVjdXRlU3RhdGVtZW50Q29tbWFuZCh7XG4gICAgICByZXNvdXJjZUFybjogREFUQUJBU0VfUkVTT1VSQ0VfQVJOLFxuICAgICAgc2VjcmV0QXJuOiBEQVRBQkFTRV9TRUNSRVRfQVJOLFxuICAgICAgZGF0YWJhc2U6IERBVEFCQVNFX05BTUUsXG4gICAgICBzcWwsXG4gICAgICBwYXJhbWV0ZXJzLFxuICAgIH0pXG4gICk7XG59XG5cbi8vIFN0cmVhbSB0byBidWZmZXIgY29udmVydGVyXG5hc3luYyBmdW5jdGlvbiBzdHJlYW1Ub0J1ZmZlcihzdHJlYW06IFJlYWRhYmxlKTogUHJvbWlzZTxCdWZmZXI+IHtcbiAgY29uc3QgY2h1bmtzOiBCdWZmZXJbXSA9IFtdO1xuICBmb3IgYXdhaXQgKGNvbnN0IGNodW5rIG9mIHN0cmVhbSkge1xuICAgIGNodW5rcy5wdXNoKEJ1ZmZlci5mcm9tKGNodW5rKSk7XG4gIH1cbiAgcmV0dXJuIEJ1ZmZlci5jb25jYXQoY2h1bmtzKTtcbn1cblxuLy8gVGV4dCBleHRyYWN0aW9uIGZ1bmN0aW9ucyBmb3IgZGlmZmVyZW50IGZpbGUgdHlwZXNcbmludGVyZmFjZSBQREZFeHRyYWN0aW9uUmVzdWx0IHtcbiAgdGV4dDogc3RyaW5nIHwgbnVsbDtcbiAgcGFnZUNvdW50OiBudW1iZXI7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGV4dHJhY3RUZXh0RnJvbVBERihidWZmZXI6IEJ1ZmZlcik6IFByb21pc2U8UERGRXh0cmFjdGlvblJlc3VsdD4ge1xuICB0cnkge1xuICAgIGNvbnNvbGUubG9nKGBBdHRlbXB0aW5nIHRvIHBhcnNlIFBERiwgYnVmZmVyIHNpemU6ICR7YnVmZmVyLmxlbmd0aH0gYnl0ZXNgKTtcbiAgICBcbiAgICAvLyBUcnkgcGFyc2luZyB0aGUgUERGXG4gICAgY29uc3QgZGF0YSA9IGF3YWl0IHBkZlBhcnNlKGJ1ZmZlcik7XG4gICAgY29uc29sZS5sb2coYFBERiBwYXJzZWQgc3VjY2Vzc2Z1bGx5LCB0ZXh0IGxlbmd0aDogJHtkYXRhLnRleHQ/Lmxlbmd0aCB8fCAwfSBjaGFyYWN0ZXJzYCk7XG4gICAgY29uc29sZS5sb2coYFBERiBpbmZvIC0gcGFnZXM6ICR7ZGF0YS5udW1wYWdlc30sIHZlcnNpb246ICR7ZGF0YS52ZXJzaW9ufWApO1xuICAgIFxuICAgIGNvbnN0IHBhZ2VDb3VudCA9IGRhdGEubnVtcGFnZXMgfHwgMTtcbiAgICBcbiAgICAvLyBJZiBubyB0ZXh0IGV4dHJhY3RlZCwgaXQgbWlnaHQgYmUgYSBzY2FubmVkIFBERlxuICAgIGlmICghZGF0YS50ZXh0IHx8IGRhdGEudGV4dC50cmltKCkubGVuZ3RoID09PSAwKSB7XG4gICAgICBjb25zb2xlLndhcm4oJ05vIHRleHQgZm91bmQgaW4gUERGIC0gaXQgbWlnaHQgYmUgYSBzY2FubmVkIGltYWdlIFBERicpO1xuICAgICAgLy8gUmV0dXJuIG51bGwgdG8gaW5kaWNhdGUgT0NSIGlzIG5lZWRlZFxuICAgICAgcmV0dXJuIHsgdGV4dDogbnVsbCwgcGFnZUNvdW50IH07XG4gICAgfVxuICAgIFxuICAgIC8vIEFsc28gY2hlY2sgaWYgZXh0cmFjdGVkIHRleHQgaXMgc3VzcGljaW91c2x5IHNob3J0IGZvciB0aGUgbnVtYmVyIG9mIHBhZ2VzXG4gICAgY29uc3QgYXZnQ2hhcnNQZXJQYWdlID0gZGF0YS50ZXh0Lmxlbmd0aCAvIHBhZ2VDb3VudDtcbiAgICBpZiAoYXZnQ2hhcnNQZXJQYWdlIDwgMTAwICYmIHBhZ2VDb3VudCA+IDEpIHtcbiAgICAgIGNvbnNvbGUud2FybihgU3VzcGljaW91c2x5IGxvdyB0ZXh0IGNvbnRlbnQ6ICR7YXZnQ2hhcnNQZXJQYWdlfSBjaGFycy9wYWdlIGZvciAke3BhZ2VDb3VudH0gcGFnZXNgKTtcbiAgICAgIHJldHVybiB7IHRleHQ6IG51bGwsIHBhZ2VDb3VudCB9O1xuICAgIH1cbiAgICBcbiAgICByZXR1cm4geyB0ZXh0OiBkYXRhLnRleHQsIHBhZ2VDb3VudCB9O1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ1BERiBwYXJzaW5nIGVycm9yOicsIGVycm9yKTtcbiAgICAvLyBUcnkgYSBtb3JlIGJhc2ljIGV4dHJhY3Rpb24gYXMgZmFsbGJhY2tcbiAgICB0cnkge1xuICAgICAgY29uc3QgYmFzaWNEYXRhID0gYXdhaXQgcGRmUGFyc2UoYnVmZmVyKTtcbiAgICAgIGlmIChiYXNpY0RhdGEudGV4dCkge1xuICAgICAgICBjb25zb2xlLmxvZygnQmFzaWMgZXh0cmFjdGlvbiBzdWNjZWVkZWQnKTtcbiAgICAgICAgcmV0dXJuIHsgdGV4dDogYmFzaWNEYXRhLnRleHQsIHBhZ2VDb3VudDogYmFzaWNEYXRhLm51bXBhZ2VzIHx8IDEgfTtcbiAgICAgIH1cbiAgICB9IGNhdGNoIChmYWxsYmFja0Vycm9yKSB7XG4gICAgICBjb25zb2xlLmVycm9yKCdGYWxsYmFjayBQREYgcGFyc2luZyBhbHNvIGZhaWxlZDonLCBmYWxsYmFja0Vycm9yKTtcbiAgICB9XG4gICAgLy8gUmV0dXJuIG51bGwgdGV4dCB0byB0cmlnZ2VyIE9DUlxuICAgIGNvbnNvbGUuZXJyb3IoYEZhaWxlZCB0byBwYXJzZSBQREY6ICR7ZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiAnVW5rbm93biBlcnJvcid9YCk7XG4gICAgcmV0dXJuIHsgdGV4dDogbnVsbCwgcGFnZUNvdW50OiAxIH07XG4gIH1cbn1cblxuYXN5bmMgZnVuY3Rpb24gZXh0cmFjdFRleHRGcm9tRE9DWChidWZmZXI6IEJ1ZmZlcik6IFByb21pc2U8c3RyaW5nPiB7XG4gIGNvbnN0IHJlc3VsdCA9IGF3YWl0IG1hbW1vdGguZXh0cmFjdFJhd1RleHQoeyBidWZmZXIgfSk7XG4gIHJldHVybiByZXN1bHQudmFsdWU7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGV4dHJhY3RUZXh0RnJvbUV4Y2VsKGJ1ZmZlcjogQnVmZmVyKTogUHJvbWlzZTxzdHJpbmc+IHtcbiAgY29uc3Qgd29ya2Jvb2sgPSBYTFNYLnJlYWQoYnVmZmVyKTtcbiAgbGV0IHRleHQgPSAnJztcbiAgXG4gIHdvcmtib29rLlNoZWV0TmFtZXMuZm9yRWFjaCgoc2hlZXROYW1lOiBzdHJpbmcpID0+IHtcbiAgICBjb25zdCBzaGVldCA9IHdvcmtib29rLlNoZWV0c1tzaGVldE5hbWVdO1xuICAgIGNvbnN0IGNzdiA9IFhMU1gudXRpbHMuc2hlZXRfdG9fY3N2KHNoZWV0KTtcbiAgICB0ZXh0ICs9IGBcXG5cXG4jIyBTaGVldDogJHtzaGVldE5hbWV9XFxuJHtjc3Z9YDtcbiAgfSk7XG4gIFxuICByZXR1cm4gdGV4dC50cmltKCk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGV4dHJhY3RUZXh0RnJvbUNTVihidWZmZXI6IEJ1ZmZlcik6IFByb21pc2U8c3RyaW5nPiB7XG4gIGNvbnN0IHJlY29yZHMgPSBjc3ZQYXJzZShidWZmZXIudG9TdHJpbmcoKSwge1xuICAgIGNvbHVtbnM6IHRydWUsXG4gICAgc2tpcF9lbXB0eV9saW5lczogdHJ1ZSxcbiAgfSk7XG4gIFxuICByZXR1cm4gSlNPTi5zdHJpbmdpZnkocmVjb3JkcywgbnVsbCwgMik7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGV4dHJhY3RUZXh0RnJvbU1hcmtkb3duKGJ1ZmZlcjogQnVmZmVyKTogUHJvbWlzZTxzdHJpbmc+IHtcbiAgY29uc3QgbWFya2Rvd24gPSBidWZmZXIudG9TdHJpbmcoKTtcbiAgLy8gQ29udmVydCB0byBwbGFpbiB0ZXh0IGJ5IHJlbW92aW5nIG1hcmtkb3duIHN5bnRheFxuICBjb25zdCBodG1sID0gYXdhaXQgbWFya2VkLnBhcnNlKG1hcmtkb3duKTtcbiAgLy8gU2ltcGxlIEhUTUwgdG8gdGV4dCBjb252ZXJzaW9uXG4gIHJldHVybiBodG1sLnJlcGxhY2UoLzxbXj5dKj4vZywgJycpLnRyaW0oKTtcbn1cblxuLy8gUmVzdWx0IHR5cGUgZm9yIHRleHQgZXh0cmFjdGlvblxuaW50ZXJmYWNlIFRleHRFeHRyYWN0aW9uUmVzdWx0IHtcbiAgdGV4dDogc3RyaW5nIHwgbnVsbDtcbiAgcGFnZUNvdW50PzogbnVtYmVyO1xufVxuXG4vLyBNYWluIHRleHQgZXh0cmFjdGlvbiBkaXNwYXRjaGVyXG5hc3luYyBmdW5jdGlvbiBleHRyYWN0VGV4dChidWZmZXI6IEJ1ZmZlciwgZmlsZVR5cGU6IHN0cmluZyk6IFByb21pc2U8VGV4dEV4dHJhY3Rpb25SZXN1bHQ+IHtcbiAgY29uc3QgbG93ZXJUeXBlID0gZmlsZVR5cGUudG9Mb3dlckNhc2UoKTtcbiAgXG4gIGlmIChsb3dlclR5cGUuaW5jbHVkZXMoJ3BkZicpKSB7XG4gICAgcmV0dXJuIGV4dHJhY3RUZXh0RnJvbVBERihidWZmZXIpO1xuICB9IGVsc2UgaWYgKGxvd2VyVHlwZS5pbmNsdWRlcygnd29yZCcpIHx8IGxvd2VyVHlwZS5lbmRzV2l0aCgnLmRvY3gnKSkge1xuICAgIGNvbnN0IHRleHQgPSBhd2FpdCBleHRyYWN0VGV4dEZyb21ET0NYKGJ1ZmZlcik7XG4gICAgcmV0dXJuIHsgdGV4dCB9O1xuICB9IGVsc2UgaWYgKGxvd2VyVHlwZS5pbmNsdWRlcygnc2hlZXQnKSB8fCBsb3dlclR5cGUuZW5kc1dpdGgoJy54bHN4JykgfHwgbG93ZXJUeXBlLmVuZHNXaXRoKCcueGxzJykpIHtcbiAgICBjb25zdCB0ZXh0ID0gYXdhaXQgZXh0cmFjdFRleHRGcm9tRXhjZWwoYnVmZmVyKTtcbiAgICByZXR1cm4geyB0ZXh0IH07XG4gIH0gZWxzZSBpZiAobG93ZXJUeXBlLmVuZHNXaXRoKCcuY3N2JykpIHtcbiAgICBjb25zdCB0ZXh0ID0gYXdhaXQgZXh0cmFjdFRleHRGcm9tQ1NWKGJ1ZmZlcik7XG4gICAgcmV0dXJuIHsgdGV4dCB9O1xuICB9IGVsc2UgaWYgKGxvd2VyVHlwZS5lbmRzV2l0aCgnLm1kJykgfHwgbG93ZXJUeXBlLmluY2x1ZGVzKCdtYXJrZG93bicpKSB7XG4gICAgY29uc3QgdGV4dCA9IGF3YWl0IGV4dHJhY3RUZXh0RnJvbU1hcmtkb3duKGJ1ZmZlcik7XG4gICAgcmV0dXJuIHsgdGV4dCB9O1xuICB9IGVsc2UgaWYgKGxvd2VyVHlwZS5lbmRzV2l0aCgnLnR4dCcpIHx8IGxvd2VyVHlwZS5pbmNsdWRlcygndGV4dCcpKSB7XG4gICAgcmV0dXJuIHsgdGV4dDogYnVmZmVyLnRvU3RyaW5nKCkgfTtcbiAgfSBlbHNlIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoYFVuc3VwcG9ydGVkIGZpbGUgdHlwZTogJHtmaWxlVHlwZX1gKTtcbiAgfVxufVxuXG4vLyBJbnRlbGxpZ2VudCB0ZXh0IGNodW5raW5nXG5mdW5jdGlvbiBjaHVua1RleHQodGV4dDogc3RyaW5nLCBtYXhDaHVua1NpemU6IG51bWJlciA9IDIwMDApOiBDaHVua0RhdGFbXSB7XG4gIGNvbnN0IGNodW5rczogQ2h1bmtEYXRhW10gPSBbXTtcbiAgY29uc3QgbGluZXMgPSB0ZXh0LnNwbGl0KCdcXG4nKTtcbiAgbGV0IGN1cnJlbnRDaHVuayA9ICcnO1xuICBsZXQgY2h1bmtJbmRleCA9IDA7XG4gIFxuICBmb3IgKGNvbnN0IGxpbmUgb2YgbGluZXMpIHtcbiAgICBpZiAoKGN1cnJlbnRDaHVuayArIGxpbmUpLmxlbmd0aCA+IG1heENodW5rU2l6ZSAmJiBjdXJyZW50Q2h1bmsubGVuZ3RoID4gMCkge1xuICAgICAgY2h1bmtzLnB1c2goe1xuICAgICAgICBjb250ZW50OiBjdXJyZW50Q2h1bmsudHJpbSgpLFxuICAgICAgICBtZXRhZGF0YTogeyBsaW5lU3RhcnQ6IGNodW5rSW5kZXggfSxcbiAgICAgICAgY2h1bmtJbmRleDogY2h1bmtzLmxlbmd0aCxcbiAgICAgICAgdG9rZW5zOiBNYXRoLmNlaWwoY3VycmVudENodW5rLmxlbmd0aCAvIDQpLCAvLyBSb3VnaCB0b2tlbiBlc3RpbWF0ZVxuICAgICAgfSk7XG4gICAgICBjdXJyZW50Q2h1bmsgPSBsaW5lICsgJ1xcbic7XG4gICAgfSBlbHNlIHtcbiAgICAgIGN1cnJlbnRDaHVuayArPSBsaW5lICsgJ1xcbic7XG4gICAgfVxuICB9XG4gIFxuICBpZiAoY3VycmVudENodW5rLnRyaW0oKS5sZW5ndGggPiAwKSB7XG4gICAgY2h1bmtzLnB1c2goe1xuICAgICAgY29udGVudDogY3VycmVudENodW5rLnRyaW0oKSxcbiAgICAgIG1ldGFkYXRhOiB7IGxpbmVTdGFydDogY2h1bmtJbmRleCB9LFxuICAgICAgY2h1bmtJbmRleDogY2h1bmtzLmxlbmd0aCxcbiAgICAgIHRva2VuczogTWF0aC5jZWlsKGN1cnJlbnRDaHVuay5sZW5ndGggLyA0KSxcbiAgICB9KTtcbiAgfVxuICBcbiAgcmV0dXJuIGNodW5rcztcbn1cblxuLy8gU3RvcmUgY2h1bmtzIGluIGRhdGFiYXNlIGFuZCByZXR1cm4gY2h1bmsgSURzXG5hc3luYyBmdW5jdGlvbiBzdG9yZUNodW5rcyhpdGVtSWQ6IG51bWJlciwgY2h1bmtzOiBDaHVua0RhdGFbXSk6IFByb21pc2U8eyBjaHVua0lkczogbnVtYmVyW107IHRleHRzOiBzdHJpbmdbXSB9PiB7XG4gIGlmIChjaHVua3MubGVuZ3RoID09PSAwKSByZXR1cm4geyBjaHVua0lkczogW10sIHRleHRzOiBbXSB9O1xuICBcbiAgLy8gRmlyc3QsIGRlbGV0ZSBleGlzdGluZyBjaHVua3MgZm9yIHRoaXMgaXRlbVxuICBhd2FpdCByZHNDbGllbnQuc2VuZChcbiAgICBuZXcgRXhlY3V0ZVN0YXRlbWVudENvbW1hbmQoe1xuICAgICAgcmVzb3VyY2VBcm46IERBVEFCQVNFX1JFU09VUkNFX0FSTixcbiAgICAgIHNlY3JldEFybjogREFUQUJBU0VfU0VDUkVUX0FSTixcbiAgICAgIGRhdGFiYXNlOiBEQVRBQkFTRV9OQU1FLFxuICAgICAgc3FsOiAnREVMRVRFIEZST00gcmVwb3NpdG9yeV9pdGVtX2NodW5rcyBXSEVSRSBpdGVtX2lkID0gOml0ZW1JZCcsXG4gICAgICBwYXJhbWV0ZXJzOiBbY3JlYXRlU3FsUGFyYW1ldGVyKCdpdGVtSWQnLCBpdGVtSWQpXSxcbiAgICB9KVxuICApO1xuICBcbiAgY29uc3QgY2h1bmtJZHM6IG51bWJlcltdID0gW107XG4gIGNvbnN0IHRleHRzOiBzdHJpbmdbXSA9IFtdO1xuICBcbiAgLy8gQmF0Y2ggaW5zZXJ0IG5ldyBjaHVua3NcbiAgY29uc3QgcGFyYW1ldGVyU2V0czogU3FsUGFyYW1ldGVyW11bXSA9IGNodW5rcy5tYXAoY2h1bmsgPT4gW1xuICAgIGNyZWF0ZVNxbFBhcmFtZXRlcignaXRlbUlkJywgaXRlbUlkKSxcbiAgICBjcmVhdGVTcWxQYXJhbWV0ZXIoJ2NvbnRlbnQnLCBjaHVuay5jb250ZW50KSxcbiAgICBjcmVhdGVTcWxQYXJhbWV0ZXIoJ21ldGFkYXRhJywgSlNPTi5zdHJpbmdpZnkoY2h1bmsubWV0YWRhdGEpKSxcbiAgICBjcmVhdGVTcWxQYXJhbWV0ZXIoJ2NodW5rSW5kZXgnLCBjaHVuay5jaHVua0luZGV4KSxcbiAgICBjcmVhdGVTcWxQYXJhbWV0ZXIoJ3Rva2VucycsIGNodW5rLnRva2VucyA/PyBudWxsKSxcbiAgXSk7XG4gIFxuICAvLyBCYXRjaEV4ZWN1dGVTdGF0ZW1lbnQgaGFzIGEgbGltaXQgb2YgMjUgcGFyYW1ldGVyIHNldHNcbiAgY29uc3QgYmF0Y2hTaXplID0gMjU7XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgcGFyYW1ldGVyU2V0cy5sZW5ndGg7IGkgKz0gYmF0Y2hTaXplKSB7XG4gICAgY29uc3QgYmF0Y2ggPSBwYXJhbWV0ZXJTZXRzLnNsaWNlKGksIGkgKyBiYXRjaFNpemUpO1xuICAgIGNvbnN0IGJhdGNoQ2h1bmtzID0gY2h1bmtzLnNsaWNlKGksIGkgKyBiYXRjaFNpemUpO1xuICAgIFxuICAgIGF3YWl0IHJkc0NsaWVudC5zZW5kKFxuICAgICAgbmV3IEJhdGNoRXhlY3V0ZVN0YXRlbWVudENvbW1hbmQoe1xuICAgICAgICByZXNvdXJjZUFybjogREFUQUJBU0VfUkVTT1VSQ0VfQVJOLFxuICAgICAgICBzZWNyZXRBcm46IERBVEFCQVNFX1NFQ1JFVF9BUk4sXG4gICAgICAgIGRhdGFiYXNlOiBEQVRBQkFTRV9OQU1FLFxuICAgICAgICBzcWw6IGBJTlNFUlQgSU5UTyByZXBvc2l0b3J5X2l0ZW1fY2h1bmtzIFxuICAgICAgICAgICAgICAoaXRlbV9pZCwgY29udGVudCwgbWV0YWRhdGEsIGNodW5rX2luZGV4LCB0b2tlbnMpXG4gICAgICAgICAgICAgIFZBTFVFUyAoOml0ZW1JZCwgOmNvbnRlbnQsIDptZXRhZGF0YTo6anNvbmIsIDpjaHVua0luZGV4LCA6dG9rZW5zKWAsXG4gICAgICAgIHBhcmFtZXRlclNldHM6IGJhdGNoLFxuICAgICAgfSlcbiAgICApO1xuICAgIFxuICAgIC8vIEJhdGNoRXhlY3V0ZVN0YXRlbWVudCBkb2Vzbid0IHN1cHBvcnQgUkVUVVJOSU5HLCBzbyBxdWVyeSBmb3IgdGhlIElEc1xuICAgIGNvbnN0IGNodW5rUmVzdWx0ID0gYXdhaXQgcmRzQ2xpZW50LnNlbmQoXG4gICAgICBuZXcgRXhlY3V0ZVN0YXRlbWVudENvbW1hbmQoe1xuICAgICAgICByZXNvdXJjZUFybjogREFUQUJBU0VfUkVTT1VSQ0VfQVJOLFxuICAgICAgICBzZWNyZXRBcm46IERBVEFCQVNFX1NFQ1JFVF9BUk4sXG4gICAgICAgIGRhdGFiYXNlOiBEQVRBQkFTRV9OQU1FLFxuICAgICAgICBzcWw6IGBTRUxFQ1QgaWQsIGNvbnRlbnQgRlJPTSByZXBvc2l0b3J5X2l0ZW1fY2h1bmtzIFxuICAgICAgICAgICAgICBXSEVSRSBpdGVtX2lkID0gOml0ZW1JZCBcbiAgICAgICAgICAgICAgQU5EIGNodW5rX2luZGV4ID49IDpzdGFydEluZGV4IFxuICAgICAgICAgICAgICBBTkQgY2h1bmtfaW5kZXggPCA6ZW5kSW5kZXhcbiAgICAgICAgICAgICAgT1JERVIgQlkgY2h1bmtfaW5kZXhgLFxuICAgICAgICBwYXJhbWV0ZXJzOiBbXG4gICAgICAgICAgY3JlYXRlU3FsUGFyYW1ldGVyKCdpdGVtSWQnLCBpdGVtSWQpLFxuICAgICAgICAgIGNyZWF0ZVNxbFBhcmFtZXRlcignc3RhcnRJbmRleCcsIGkpLFxuICAgICAgICAgIGNyZWF0ZVNxbFBhcmFtZXRlcignZW5kSW5kZXgnLCBpICsgYmF0Y2gubGVuZ3RoKVxuICAgICAgICBdXG4gICAgICB9KVxuICAgICk7XG4gICAgXG4gICAgaWYgKGNodW5rUmVzdWx0LnJlY29yZHMpIHtcbiAgICAgIGNodW5rUmVzdWx0LnJlY29yZHMuZm9yRWFjaChyZWNvcmQgPT4ge1xuICAgICAgICBpZiAocmVjb3JkWzBdPy5sb25nVmFsdWUgJiYgcmVjb3JkWzFdPy5zdHJpbmdWYWx1ZSkge1xuICAgICAgICAgIGNodW5rSWRzLnB1c2gocmVjb3JkWzBdLmxvbmdWYWx1ZSk7XG4gICAgICAgICAgdGV4dHMucHVzaChyZWNvcmRbMV0uc3RyaW5nVmFsdWUpO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9XG4gIH1cbiAgXG4gIHJldHVybiB7IGNodW5rSWRzLCB0ZXh0cyB9O1xufVxuXG4vLyBQcm9jZXNzIGEgc2luZ2xlIGZpbGVcbmFzeW5jIGZ1bmN0aW9uIHByb2Nlc3NGaWxlKGpvYjogUHJvY2Vzc2luZ0pvYikge1xuICBjb25zb2xlLmxvZyhgUHJvY2Vzc2luZyBmaWxlOiAke2pvYi5maWxlTmFtZX0gKCR7am9iLmZpbGVUeXBlfSlgKTtcbiAgXG4gIHRyeSB7XG4gICAgLy8gVXBkYXRlIHN0YXR1cyB0byBwcm9jZXNzaW5nXG4gICAgYXdhaXQgdXBkYXRlSXRlbVN0YXR1cyhqb2IuaXRlbUlkLCAncHJvY2Vzc2luZycpO1xuICAgIGF3YWl0IHVwZGF0ZUpvYlN0YXR1cyhqb2Iuam9iSWQsICdwcm9jZXNzaW5nJywgeyBmaWxlTmFtZTogam9iLmZpbGVOYW1lIH0pO1xuICAgIFxuICAgIC8vIERvd25sb2FkIGZpbGUgZnJvbSBTM1xuICAgIGNvbnN0IGdldE9iamVjdENvbW1hbmQgPSBuZXcgR2V0T2JqZWN0Q29tbWFuZCh7XG4gICAgICBCdWNrZXQ6IGpvYi5idWNrZXROYW1lLFxuICAgICAgS2V5OiBqb2IuZmlsZUtleSxcbiAgICB9KTtcbiAgICBcbiAgICBjb25zb2xlLmxvZyhgRG93bmxvYWRpbmcgZnJvbSBTMzogJHtqb2IuYnVja2V0TmFtZX0vJHtqb2IuZmlsZUtleX1gKTtcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHMzQ2xpZW50LnNlbmQoZ2V0T2JqZWN0Q29tbWFuZCk7XG4gICAgY29uc3Qgc3RyZWFtID0gcmVzcG9uc2UuQm9keSBhcyBSZWFkYWJsZTtcbiAgICBjb25zdCBidWZmZXIgPSBhd2FpdCBzdHJlYW1Ub0J1ZmZlcihzdHJlYW0pO1xuICAgIGNvbnNvbGUubG9nKGBEb3dubG9hZGVkICR7YnVmZmVyLmxlbmd0aH0gYnl0ZXMgZnJvbSBTM2ApO1xuICAgIFxuICAgIC8vIEV4dHJhY3QgdGV4dFxuICAgIGNvbnN0IGV4dHJhY3Rpb25SZXN1bHQgPSBhd2FpdCBleHRyYWN0VGV4dChidWZmZXIsIGpvYi5maWxlVHlwZSk7XG4gICAgbGV0IHRleHQgPSBleHRyYWN0aW9uUmVzdWx0LnRleHQ7XG4gICAgXG4gICAgLy8gQ2hlY2sgaWYgdGhpcyBpcyBhIFBERiB0aGF0IG5lZWRzIE9DUlxuICAgIGlmICh0ZXh0ID09PSBudWxsICYmIGpvYi5maWxlVHlwZS50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKCdwZGYnKSkge1xuICAgICAgY29uc29sZS5sb2coJ1BERiBuZWVkcyBPQ1IgcHJvY2Vzc2luZywgc3RhcnRpbmcgVGV4dHJhY3Qgam9iLi4uJyk7XG4gICAgICBcbiAgICAgIC8vIFVzZSBwYWdlIGNvdW50IGZyb20gZXh0cmFjdGlvbiByZXN1bHRcbiAgICAgIGNvbnN0IHBhZ2VDb3VudCA9IGV4dHJhY3Rpb25SZXN1bHQucGFnZUNvdW50IHx8IDE7XG4gICAgICBcbiAgICAgIGNvbnN0IHRleHRyYWN0Sm9iSWQgPSBhd2FpdCBzdGFydFRleHRyYWN0Sm9iKFxuICAgICAgICBqb2IuYnVja2V0TmFtZSxcbiAgICAgICAgam9iLmZpbGVLZXksXG4gICAgICAgIGpvYi5pdGVtSWQsXG4gICAgICAgIGpvYi5maWxlTmFtZSxcbiAgICAgICAgcGFnZUNvdW50XG4gICAgICApO1xuICAgICAgXG4gICAgICBpZiAodGV4dHJhY3RKb2JJZCkge1xuICAgICAgICAvLyBVcGRhdGUgc3RhdHVzIHRvIGluZGljYXRlIE9DUiBwcm9jZXNzaW5nXG4gICAgICAgIGF3YWl0IHVwZGF0ZUl0ZW1TdGF0dXMoam9iLml0ZW1JZCwgJ3Byb2Nlc3Npbmdfb2NyJyk7XG4gICAgICAgIGF3YWl0IHVwZGF0ZUpvYlN0YXR1cyhqb2Iuam9iSWQsICdvY3JfcHJvY2Vzc2luZycsIHsgXG4gICAgICAgICAgZmlsZU5hbWU6IGpvYi5maWxlTmFtZSxcbiAgICAgICAgICB0ZXh0cmFjdEpvYklkIFxuICAgICAgICB9KTtcbiAgICAgICAgXG4gICAgICAgIC8vIEV4aXQgZWFybHkgLSBUZXh0cmFjdCB3aWxsIGhhbmRsZSB0aGUgcmVzdCB2aWEgU05TXG4gICAgICAgIGNvbnNvbGUubG9nKCdGaWxlIHF1ZXVlZCBmb3IgT0NSIHByb2Nlc3NpbmcnKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdGYWlsZWQgdG8gc3RhcnQgVGV4dHJhY3Qgam9iIGZvciBPQ1IgcHJvY2Vzc2luZycpO1xuICAgICAgfVxuICAgIH1cbiAgICBcbiAgICBpZiAoIXRleHQgfHwgdGV4dC50cmltKCkubGVuZ3RoID09PSAwKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ05vIHRleHQgY29udGVudCBleHRyYWN0ZWQgZnJvbSBmaWxlJyk7XG4gICAgfVxuICAgIFxuICAgIC8vIENodW5rIHRleHRcbiAgICBjb25zdCBjaHVua3MgPSBjaHVua1RleHQodGV4dCk7XG4gICAgY29uc29sZS5sb2coYEV4dHJhY3RlZCAke2NodW5rcy5sZW5ndGh9IGNodW5rcyBmcm9tICR7am9iLmZpbGVOYW1lfWApO1xuICAgIFxuICAgIC8vIFN0b3JlIGNodW5rcyBhbmQgZ2V0IHRoZWlyIElEc1xuICAgIGNvbnN0IHsgY2h1bmtJZHMsIHRleHRzIH0gPSBhd2FpdCBzdG9yZUNodW5rcyhqb2IuaXRlbUlkLCBjaHVua3MpO1xuICAgIFxuICAgIC8vIFF1ZXVlIGVtYmVkZGluZ3MgaWYgZW5hYmxlZCBhbmQgY2h1bmtzIHdlcmUgY3JlYXRlZFxuICAgIGlmIChFTUJFRERJTkdfUVVFVUVfVVJMICYmIGNodW5rSWRzLmxlbmd0aCA+IDApIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGF3YWl0IHNxc0NsaWVudC5zZW5kKFxuICAgICAgICAgIG5ldyBTZW5kTWVzc2FnZUNvbW1hbmQoe1xuICAgICAgICAgICAgUXVldWVVcmw6IEVNQkVERElOR19RVUVVRV9VUkwsXG4gICAgICAgICAgICBNZXNzYWdlQm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgICAgICBpdGVtSWQ6IGpvYi5pdGVtSWQsXG4gICAgICAgICAgICAgIGNodW5rSWRzLFxuICAgICAgICAgICAgICB0ZXh0c1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICB9KVxuICAgICAgICApO1xuICAgICAgICBjb25zb2xlLmxvZyhgU3VjY2Vzc2Z1bGx5IHF1ZXVlZCAke2NodW5rSWRzLmxlbmd0aH0gY2h1bmtzIGZvciBlbWJlZGRpbmcgZ2VuZXJhdGlvbmApO1xuICAgICAgICAvLyBVcGRhdGUgc3RhdHVzIHRvIGluZGljYXRlIGVtYmVkZGluZ3MgYXJlIGJlaW5nIHByb2Nlc3NlZFxuICAgICAgICBhd2FpdCB1cGRhdGVJdGVtU3RhdHVzKGpvYi5pdGVtSWQsICdwcm9jZXNzaW5nX2VtYmVkZGluZ3MnKTtcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoJ0ZhaWxlZCB0byBxdWV1ZSBlbWJlZGRpbmdzOicsIGVycm9yKTtcbiAgICAgICAgLy8gRG9uJ3QgZmFpbCB0aGUgd2hvbGUgam9iIGlmIGVtYmVkZGluZyBxdWV1ZWluZyBmYWlsc1xuICAgICAgICBhd2FpdCB1cGRhdGVJdGVtU3RhdHVzKGpvYi5pdGVtSWQsICdjb21wbGV0ZWQnKTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgLy8gVXBkYXRlIHN0YXR1cyB0byBjb21wbGV0ZWQgaWYgbm8gZW1iZWRkaW5nIHF1ZXVlIGNvbmZpZ3VyZWRcbiAgICAgIGF3YWl0IHVwZGF0ZUl0ZW1TdGF0dXMoam9iLml0ZW1JZCwgJ2NvbXBsZXRlZCcpO1xuICAgIH1cbiAgICBcbiAgICBhd2FpdCB1cGRhdGVKb2JTdGF0dXMoam9iLmpvYklkLCAnY29tcGxldGVkJywge1xuICAgICAgZmlsZU5hbWU6IGpvYi5maWxlTmFtZSxcbiAgICAgIGNodW5rc0NyZWF0ZWQ6IGNodW5rcy5sZW5ndGgsXG4gICAgICB0b3RhbFRva2VuczogY2h1bmtzLnJlZHVjZSgoc3VtLCBjaHVuaykgPT4gc3VtICsgKGNodW5rLnRva2VucyB8fCAwKSwgMCksXG4gICAgfSk7XG4gICAgXG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcihgRXJyb3IgcHJvY2Vzc2luZyBmaWxlICR7am9iLmZpbGVOYW1lfTpgLCBlcnJvcik7XG4gICAgY29uc3QgZXJyb3JNZXNzYWdlID0gZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiAnVW5rbm93biBlcnJvcic7XG4gICAgXG4gICAgYXdhaXQgdXBkYXRlSXRlbVN0YXR1cyhqb2IuaXRlbUlkLCAnZmFpbGVkJywgZXJyb3JNZXNzYWdlKTtcbiAgICBhd2FpdCB1cGRhdGVKb2JTdGF0dXMoam9iLmpvYklkLCAnZmFpbGVkJywgeyBmaWxlTmFtZTogam9iLmZpbGVOYW1lIH0sIGVycm9yTWVzc2FnZSk7XG4gICAgXG4gICAgdGhyb3cgZXJyb3I7IC8vIFJlLXRocm93IHRvIGxldCBMYW1iZGEgaGFuZGxlIHJldHJ5IGxvZ2ljXG4gIH1cbn1cblxuLy8gVmFsaWRhdGUgUzMga2V5IHRvIHByZXZlbnQgcGF0aCB0cmF2ZXJzYWwgYXR0YWNrc1xuZnVuY3Rpb24gdmFsaWRhdGVTM0tleShrZXk6IHN0cmluZyk6IGJvb2xlYW4ge1xuICAvLyBSZWplY3Qga2V5cyB3aXRoIHBhdGggdHJhdmVyc2FsIHBhdHRlcm5zXG4gIGlmIChrZXkuaW5jbHVkZXMoJy4uLycpIHx8IGtleS5pbmNsdWRlcygnLi5cXFxcJykgfHwga2V5LnN0YXJ0c1dpdGgoJy8nKSkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICBcbiAgLy8gQWNjZXB0IHR3byB2YWxpZCBwYXR0ZXJuczpcbiAgLy8gMS4gTmV3IGZvcm1hdDogcmVwb3NpdG9yaWVzL3tyZXBvSWR9L3tpdGVtSWR9L3tmaWxlbmFtZX1cbiAgLy8gMi4gTGVnYWN5IGZvcm1hdDoge3VzZXJJZH0ve3RpbWVzdGFtcH0te2ZpbGVuYW1lfVxuICBjb25zdCBuZXdGb3JtYXRQYXR0ZXJuID0gL15yZXBvc2l0b3JpZXNcXC9cXGQrXFwvXFxkK1xcL1teL10rJC87XG4gIGNvbnN0IGxlZ2FjeUZvcm1hdFBhdHRlcm4gPSAvXlxcZCtcXC9cXGQrLVteL10rJC87XG4gIFxuICByZXR1cm4gbmV3Rm9ybWF0UGF0dGVybi50ZXN0KGtleSkgfHwgbGVnYWN5Rm9ybWF0UGF0dGVybi50ZXN0KGtleSk7XG59XG5cbi8vIExhbWJkYSBoYW5kbGVyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gaGFuZGxlcihldmVudDogU1FTRXZlbnQpIHtcbiAgY29uc29sZS5sb2coJ1JlY2VpdmVkIFNRUyBldmVudDonLCBKU09OLnN0cmluZ2lmeShldmVudCwgbnVsbCwgMikpO1xuICBcbiAgZm9yIChjb25zdCByZWNvcmQgb2YgZXZlbnQuUmVjb3Jkcykge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCBqb2I6IFByb2Nlc3NpbmdKb2IgPSBKU09OLnBhcnNlKHJlY29yZC5ib2R5KTtcbiAgICAgIFxuICAgICAgLy8gVmFsaWRhdGUgZmlsZSBrZXkgYmVmb3JlIHByb2Nlc3NpbmdcbiAgICAgIGlmICghdmFsaWRhdGVTM0tleShqb2IuZmlsZUtleSkpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihgSW52YWxpZCBTMyBrZXkgZGV0ZWN0ZWQ6ICR7am9iLmZpbGVLZXl9YCk7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgSW52YWxpZCBTMyBrZXk6ICR7am9iLmZpbGVLZXl9YCk7XG4gICAgICB9XG4gICAgICBcbiAgICAgIGF3YWl0IHByb2Nlc3NGaWxlKGpvYik7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ0ZhaWxlZCB0byBwcm9jZXNzIHJlY29yZDonLCBlcnJvcik7XG4gICAgICAvLyBMZXQgdGhlIGVycm9yIGJ1YmJsZSB1cCBzbyBTUVMgY2FuIHJldHJ5IG9yIHNlbmQgdG8gRExRXG4gICAgICB0aHJvdyBlcnJvcjtcbiAgICB9XG4gIH1cbn0iXX0=