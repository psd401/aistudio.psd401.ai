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
const client_rds_data_1 = require("@aws-sdk/client-rds-data");
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const node_fetch_1 = __importDefault(require("node-fetch"));
const cheerio = __importStar(require("cheerio"));
const marked_1 = require("marked");
const rdsClient = new client_rds_data_1.RDSDataClient({});
const dynamoClient = new client_dynamodb_1.DynamoDBClient({});
const JOB_STATUS_TABLE = process.env.JOB_STATUS_TABLE;
const DATABASE_RESOURCE_ARN = process.env.DATABASE_RESOURCE_ARN;
const DATABASE_SECRET_ARN = process.env.DATABASE_SECRET_ARN;
const DATABASE_NAME = process.env.DATABASE_NAME;
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
// Fetch and extract text content from URL
async function fetchAndExtractContent(url) {
    try {
        // Create an AbortController for timeout
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000); // 30 seconds
        try {
            // Fetch the URL with a timeout
            const response = await (0, node_fetch_1.default)(url, {
                signal: controller.signal,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; AIStudioBot/1.0; +https://aistudio.psd401.ai)',
                },
            });
            clearTimeout(timeout);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const contentType = response.headers.get('content-type') || '';
            const html = await response.text();
            // Parse HTML and extract text
            const $ = cheerio.load(html);
            // Remove script and style elements
            $('script, style, noscript').remove();
            // Try to find main content areas
            let content = '';
            // Common content selectors
            const contentSelectors = [
                'main',
                'article',
                '[role="main"]',
                '.content',
                '#content',
                '.post',
                '.entry-content',
                '.article-content',
            ];
            for (const selector of contentSelectors) {
                const element = $(selector);
                if (element.length > 0) {
                    content = element.text();
                    break;
                }
            }
            // If no specific content area found, get all text
            if (!content) {
                content = $('body').text();
            }
            // Clean up the text
            content = content
                .replace(/\s+/g, ' ') // Replace multiple whitespace with single space
                .replace(/\n{3,}/g, '\n\n') // Replace multiple newlines with double newline
                .trim();
            // If content is markdown or has markdown-like content, process it
            if (contentType.includes('markdown') || url.endsWith('.md')) {
                const htmlContent = await marked_1.marked.parse(content);
                content = htmlContent.replace(/<[^>]*>/g, '').trim();
            }
            // Extract metadata
            const title = $('title').text() || $('h1').first().text() || '';
            const description = $('meta[name="description"]').attr('content') ||
                $('meta[property="og:description"]').attr('content') || '';
            // Prepend metadata to content
            if (title) {
                content = `Title: ${title}\n\n${content}`;
            }
            if (description) {
                content = `Description: ${description}\n\n${content}`;
            }
            return content;
        }
        catch (fetchError) {
            clearTimeout(timeout);
            if (fetchError.name === 'AbortError') {
                throw new Error('Request timeout after 30 seconds');
            }
            throw fetchError;
        }
    }
    catch (error) {
        console.error('Error fetching URL:', error);
        throw new Error(`Failed to fetch URL: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}
// Intelligent text chunking (same as file processor)
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
// Store chunks in database
async function storeChunks(itemId, chunks) {
    if (chunks.length === 0)
        return;
    // First, delete existing chunks for this item
    await rdsClient.send(new client_rds_data_1.ExecuteStatementCommand({
        resourceArn: DATABASE_RESOURCE_ARN,
        secretArn: DATABASE_SECRET_ARN,
        database: DATABASE_NAME,
        sql: 'DELETE FROM document_chunks WHERE item_id = :itemId',
        parameters: [createSqlParameter('itemId', itemId)],
    }));
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
        await rdsClient.send(new client_rds_data_1.BatchExecuteStatementCommand({
            resourceArn: DATABASE_RESOURCE_ARN,
            secretArn: DATABASE_SECRET_ARN,
            database: DATABASE_NAME,
            sql: `INSERT INTO document_chunks 
              (item_id, content, metadata, chunk_index, tokens)
              VALUES (:itemId, :content, :metadata::jsonb, :chunkIndex, :tokens)`,
            parameterSets: batch,
        }));
    }
}
// Process a URL
async function processURL(job) {
    console.log(`Processing URL: ${job.url} for item: ${job.itemName}`);
    try {
        // Update status to processing
        await updateItemStatus(job.itemId, 'processing');
        await updateJobStatus(job.jobId, 'processing', { url: job.url });
        // Fetch and extract content from URL
        const content = await fetchAndExtractContent(job.url);
        if (!content || content.trim().length === 0) {
            throw new Error('No content extracted from URL');
        }
        // Chunk text
        const chunks = chunkText(content);
        console.log(`Extracted ${chunks.length} chunks from ${job.url}`);
        // Store chunks
        await storeChunks(job.itemId, chunks);
        // Update status to completed
        await updateItemStatus(job.itemId, 'completed');
        await updateJobStatus(job.jobId, 'completed', {
            url: job.url,
            chunksCreated: chunks.length,
            totalTokens: chunks.reduce((sum, chunk) => sum + (chunk.tokens || 0), 0),
        });
    }
    catch (error) {
        console.error(`Error processing URL ${job.url}:`, error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        await updateItemStatus(job.itemId, 'failed', errorMessage);
        await updateJobStatus(job.jobId, 'failed', { url: job.url }, errorMessage);
        throw error; // Re-throw to let Lambda handle retry logic
    }
}
// Lambda handler - can be invoked directly
async function handler(event) {
    console.log('Received event:', JSON.stringify(event, null, 2));
    try {
        // Check if this is a direct invocation with job data
        if ('jobId' in event && 'itemId' in event && 'url' in event) {
            await processURL(event);
            return {
                statusCode: 200,
                body: JSON.stringify({ message: 'URL processed successfully' }),
            };
        }
        // Otherwise, handle as API Gateway event
        const body = JSON.parse(event.body || '{}');
        if (!body.jobId || !body.itemId || !body.url) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Missing required fields: jobId, itemId, url' }),
            };
        }
        await processURL(body);
        return {
            statusCode: 200,
            body: JSON.stringify({ message: 'URL processing started' }),
        };
    }
    catch (error) {
        console.error('Handler error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                error: error instanceof Error ? error.message : 'Unknown error'
            }),
        };
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQXNVQSwwQkF1Q0M7QUE1V0QsOERBQThIO0FBQzlILDhEQUEwRTtBQUMxRSw0REFBK0I7QUFDL0IsaURBQW1DO0FBQ25DLG1DQUFnQztBQUVoQyxNQUFNLFNBQVMsR0FBRyxJQUFJLCtCQUFhLENBQUMsRUFBRSxDQUFDLENBQUM7QUFDeEMsTUFBTSxZQUFZLEdBQUcsSUFBSSxnQ0FBYyxDQUFDLEVBQUUsQ0FBQyxDQUFDO0FBRTVDLE1BQU0sZ0JBQWdCLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxnQkFBaUIsQ0FBQztBQUN2RCxNQUFNLHFCQUFxQixHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMscUJBQXNCLENBQUM7QUFDakUsTUFBTSxtQkFBbUIsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLG1CQUFvQixDQUFDO0FBQzdELE1BQU0sYUFBYSxHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsYUFBYyxDQUFDO0FBRWpELDZEQUE2RDtBQUM3RCxTQUFTLGtCQUFrQixDQUFDLElBQVksRUFBRSxLQUF1QztJQUMvRSxJQUFJLEtBQUssS0FBSyxJQUFJLEVBQUUsQ0FBQztRQUNuQixPQUFPLEVBQUUsSUFBSSxFQUFFLEtBQUssRUFBRSxFQUFFLE1BQU0sRUFBRSxJQUFJLEVBQUUsRUFBRSxDQUFDO0lBQzNDLENBQUM7SUFDRCxJQUFJLE9BQU8sS0FBSyxLQUFLLFFBQVEsRUFBRSxDQUFDO1FBQzlCLE9BQU8sRUFBRSxJQUFJLEVBQUUsS0FBSyxFQUFFLEVBQUUsV0FBVyxFQUFFLEtBQUssRUFBRSxFQUFFLENBQUM7SUFDakQsQ0FBQztJQUNELElBQUksT0FBTyxLQUFLLEtBQUssUUFBUSxFQUFFLENBQUM7UUFDOUIsT0FBTyxFQUFFLElBQUksRUFBRSxLQUFLLEVBQUUsRUFBRSxTQUFTLEVBQUUsS0FBSyxFQUFFLEVBQUUsQ0FBQztJQUMvQyxDQUFDO0lBQ0QsSUFBSSxPQUFPLEtBQUssS0FBSyxTQUFTLEVBQUUsQ0FBQztRQUMvQixPQUFPLEVBQUUsSUFBSSxFQUFFLEtBQUssRUFBRSxFQUFFLFlBQVksRUFBRSxLQUFLLEVBQUUsRUFBRSxDQUFDO0lBQ2xELENBQUM7SUFDRCxNQUFNLElBQUksS0FBSyxDQUFDLGtDQUFrQyxJQUFJLEtBQUssT0FBTyxLQUFLLEVBQUUsQ0FBQyxDQUFDO0FBQzdFLENBQUM7QUFnQkQsZ0NBQWdDO0FBQ2hDLEtBQUssVUFBVSxlQUFlLENBQzVCLEtBQWEsRUFDYixNQUFjLEVBQ2QsT0FBYSxFQUNiLEtBQWM7SUFFZCxNQUFNLFNBQVMsR0FBRyxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUM7SUFDN0IsTUFBTSxHQUFHLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxTQUFTLEdBQUcsSUFBSSxDQUFDLEdBQUcsS0FBSyxHQUFHLENBQUMsQ0FBQyxDQUFDLGFBQWE7SUFFbkUsTUFBTSxZQUFZLENBQUMsSUFBSSxDQUNyQixJQUFJLGdDQUFjLENBQUM7UUFDakIsU0FBUyxFQUFFLGdCQUFnQjtRQUMzQixJQUFJLEVBQUU7WUFDSixLQUFLLEVBQUUsRUFBRSxDQUFDLEVBQUUsS0FBSyxFQUFFO1lBQ25CLFNBQVMsRUFBRSxFQUFFLENBQUMsRUFBRSxTQUFTLENBQUMsUUFBUSxFQUFFLEVBQUU7WUFDdEMsTUFBTSxFQUFFLEVBQUUsQ0FBQyxFQUFFLE1BQU0sRUFBRTtZQUNyQixPQUFPLEVBQUUsT0FBTyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRTtZQUNsRSxLQUFLLEVBQUUsS0FBSyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxLQUFLLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFO1lBQzVDLEdBQUcsRUFBRSxFQUFFLENBQUMsRUFBRSxHQUFHLENBQUMsUUFBUSxFQUFFLEVBQUU7U0FDM0I7S0FDRixDQUFDLENBQ0gsQ0FBQztBQUNKLENBQUM7QUFFRCw0Q0FBNEM7QUFDNUMsS0FBSyxVQUFVLGdCQUFnQixDQUM3QixNQUFjLEVBQ2QsTUFBYyxFQUNkLEtBQWM7SUFFZCxNQUFNLEdBQUcsR0FBRyxLQUFLO1FBQ2YsQ0FBQyxDQUFDOzs7OzBCQUlvQjtRQUN0QixDQUFDLENBQUM7Ozs7MEJBSW9CLENBQUM7SUFFekIsTUFBTSxVQUFVLEdBQW1CO1FBQ2pDLGtCQUFrQixDQUFDLFFBQVEsRUFBRSxNQUFNLENBQUM7UUFDcEMsa0JBQWtCLENBQUMsUUFBUSxFQUFFLE1BQU0sQ0FBQztLQUNyQyxDQUFDO0lBRUYsSUFBSSxLQUFLLEVBQUUsQ0FBQztRQUNWLFVBQVUsQ0FBQyxJQUFJLENBQUMsa0JBQWtCLENBQUMsT0FBTyxFQUFFLEtBQUssQ0FBQyxDQUFDLENBQUM7SUFDdEQsQ0FBQztJQUVELE1BQU0sU0FBUyxDQUFDLElBQUksQ0FDbEIsSUFBSSx5Q0FBdUIsQ0FBQztRQUMxQixXQUFXLEVBQUUscUJBQXFCO1FBQ2xDLFNBQVMsRUFBRSxtQkFBbUI7UUFDOUIsUUFBUSxFQUFFLGFBQWE7UUFDdkIsR0FBRztRQUNILFVBQVU7S0FDWCxDQUFDLENBQ0gsQ0FBQztBQUNKLENBQUM7QUFFRCwwQ0FBMEM7QUFDMUMsS0FBSyxVQUFVLHNCQUFzQixDQUFDLEdBQVc7SUFDL0MsSUFBSSxDQUFDO1FBQ0gsd0NBQXdDO1FBQ3hDLE1BQU0sVUFBVSxHQUFHLElBQUksZUFBZSxFQUFFLENBQUM7UUFDekMsTUFBTSxPQUFPLEdBQUcsVUFBVSxDQUFDLEdBQUcsRUFBRSxDQUFDLFVBQVUsQ0FBQyxLQUFLLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFDLGFBQWE7UUFFMUUsSUFBSSxDQUFDO1lBQ0gsK0JBQStCO1lBQy9CLE1BQU0sUUFBUSxHQUFHLE1BQU0sSUFBQSxvQkFBSyxFQUFDLEdBQUcsRUFBRTtnQkFDaEMsTUFBTSxFQUFFLFVBQVUsQ0FBQyxNQUFNO2dCQUN6QixPQUFPLEVBQUU7b0JBQ1AsWUFBWSxFQUFFLHdFQUF3RTtpQkFDdkY7YUFDRixDQUFDLENBQUM7WUFFSCxZQUFZLENBQUMsT0FBTyxDQUFDLENBQUM7WUFFdEIsSUFBSSxDQUFDLFFBQVEsQ0FBQyxFQUFFLEVBQUUsQ0FBQztnQkFDakIsTUFBTSxJQUFJLEtBQUssQ0FBQyx1QkFBdUIsUUFBUSxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUM7WUFDNUQsQ0FBQztZQUVELE1BQU0sV0FBVyxHQUFHLFFBQVEsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLGNBQWMsQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUMvRCxNQUFNLElBQUksR0FBRyxNQUFNLFFBQVEsQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUVuQyw4QkFBOEI7WUFDOUIsTUFBTSxDQUFDLEdBQUcsT0FBTyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUU3QixtQ0FBbUM7WUFDbkMsQ0FBQyxDQUFDLHlCQUF5QixDQUFDLENBQUMsTUFBTSxFQUFFLENBQUM7WUFFdEMsaUNBQWlDO1lBQ2pDLElBQUksT0FBTyxHQUFHLEVBQUUsQ0FBQztZQUVqQiwyQkFBMkI7WUFDM0IsTUFBTSxnQkFBZ0IsR0FBRztnQkFDekIsTUFBTTtnQkFDTixTQUFTO2dCQUNULGVBQWU7Z0JBQ2YsVUFBVTtnQkFDVixVQUFVO2dCQUNWLE9BQU87Z0JBQ1AsZ0JBQWdCO2dCQUNoQixrQkFBa0I7YUFDbkIsQ0FBQztZQUVBLEtBQUssTUFBTSxRQUFRLElBQUksZ0JBQWdCLEVBQUUsQ0FBQztnQkFDeEMsTUFBTSxPQUFPLEdBQUcsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDO2dCQUM1QixJQUFJLE9BQU8sQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUM7b0JBQ3ZCLE9BQU8sR0FBRyxPQUFPLENBQUMsSUFBSSxFQUFFLENBQUM7b0JBQ3pCLE1BQU07Z0JBQ1IsQ0FBQztZQUNILENBQUM7WUFFRCxrREFBa0Q7WUFDbEQsSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDO2dCQUNiLE9BQU8sR0FBRyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUM7WUFDN0IsQ0FBQztZQUVELG9CQUFvQjtZQUNwQixPQUFPLEdBQUcsT0FBTztpQkFDaEIsT0FBTyxDQUFDLE1BQU0sRUFBRSxHQUFHLENBQUMsQ0FBQyxnREFBZ0Q7aUJBQ3JFLE9BQU8sQ0FBQyxTQUFTLEVBQUUsTUFBTSxDQUFDLENBQUMsZ0RBQWdEO2lCQUMzRSxJQUFJLEVBQUUsQ0FBQztZQUVSLGtFQUFrRTtZQUNsRSxJQUFJLFdBQVcsQ0FBQyxRQUFRLENBQUMsVUFBVSxDQUFDLElBQUksR0FBRyxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDO2dCQUM1RCxNQUFNLFdBQVcsR0FBRyxNQUFNLGVBQU0sQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUM7Z0JBQ2hELE9BQU8sR0FBRyxXQUFXLENBQUMsT0FBTyxDQUFDLFVBQVUsRUFBRSxFQUFFLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUN2RCxDQUFDO1lBRUQsbUJBQW1CO1lBQ25CLE1BQU0sS0FBSyxHQUFHLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsS0FBSyxFQUFFLENBQUMsSUFBSSxFQUFFLElBQUksRUFBRSxDQUFDO1lBQ2hFLE1BQU0sV0FBVyxHQUFHLENBQUMsQ0FBQywwQkFBMEIsQ0FBQyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUM7Z0JBQzlDLENBQUMsQ0FBQyxpQ0FBaUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLENBQUM7WUFFOUUsOEJBQThCO1lBQzlCLElBQUksS0FBSyxFQUFFLENBQUM7Z0JBQ1YsT0FBTyxHQUFHLFVBQVUsS0FBSyxPQUFPLE9BQU8sRUFBRSxDQUFDO1lBQzVDLENBQUM7WUFDRCxJQUFJLFdBQVcsRUFBRSxDQUFDO2dCQUNoQixPQUFPLEdBQUcsZ0JBQWdCLFdBQVcsT0FBTyxPQUFPLEVBQUUsQ0FBQztZQUN4RCxDQUFDO1lBRUQsT0FBTyxPQUFPLENBQUM7UUFDakIsQ0FBQztRQUFDLE9BQU8sVUFBZSxFQUFFLENBQUM7WUFDekIsWUFBWSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1lBQ3RCLElBQUksVUFBVSxDQUFDLElBQUksS0FBSyxZQUFZLEVBQUUsQ0FBQztnQkFDckMsTUFBTSxJQUFJLEtBQUssQ0FBQyxrQ0FBa0MsQ0FBQyxDQUFDO1lBQ3RELENBQUM7WUFDRCxNQUFNLFVBQVUsQ0FBQztRQUNuQixDQUFDO0lBQ0gsQ0FBQztJQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7UUFDZixPQUFPLENBQUMsS0FBSyxDQUFDLHFCQUFxQixFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQzVDLE1BQU0sSUFBSSxLQUFLLENBQUMsd0JBQXdCLEtBQUssWUFBWSxLQUFLLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLGVBQWUsRUFBRSxDQUFDLENBQUM7SUFDdEcsQ0FBQztBQUNILENBQUM7QUFFRCxxREFBcUQ7QUFDckQsU0FBUyxTQUFTLENBQUMsSUFBWSxFQUFFLGVBQXVCLElBQUk7SUFDMUQsTUFBTSxNQUFNLEdBQWdCLEVBQUUsQ0FBQztJQUMvQixNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQy9CLElBQUksWUFBWSxHQUFHLEVBQUUsQ0FBQztJQUN0QixJQUFJLFVBQVUsR0FBRyxDQUFDLENBQUM7SUFFbkIsS0FBSyxNQUFNLElBQUksSUFBSSxLQUFLLEVBQUUsQ0FBQztRQUN6QixJQUFJLENBQUMsWUFBWSxHQUFHLElBQUksQ0FBQyxDQUFDLE1BQU0sR0FBRyxZQUFZLElBQUksWUFBWSxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQztZQUMzRSxNQUFNLENBQUMsSUFBSSxDQUFDO2dCQUNWLE9BQU8sRUFBRSxZQUFZLENBQUMsSUFBSSxFQUFFO2dCQUM1QixRQUFRLEVBQUUsRUFBRSxTQUFTLEVBQUUsVUFBVSxFQUFFO2dCQUNuQyxVQUFVLEVBQUUsTUFBTSxDQUFDLE1BQU07Z0JBQ3pCLE1BQU0sRUFBRSxJQUFJLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLEVBQUUsdUJBQXVCO2FBQ3BFLENBQUMsQ0FBQztZQUNILFlBQVksR0FBRyxJQUFJLEdBQUcsSUFBSSxDQUFDO1FBQzdCLENBQUM7YUFBTSxDQUFDO1lBQ04sWUFBWSxJQUFJLElBQUksR0FBRyxJQUFJLENBQUM7UUFDOUIsQ0FBQztJQUNILENBQUM7SUFFRCxJQUFJLFlBQVksQ0FBQyxJQUFJLEVBQUUsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUM7UUFDbkMsTUFBTSxDQUFDLElBQUksQ0FBQztZQUNWLE9BQU8sRUFBRSxZQUFZLENBQUMsSUFBSSxFQUFFO1lBQzVCLFFBQVEsRUFBRSxFQUFFLFNBQVMsRUFBRSxVQUFVLEVBQUU7WUFDbkMsVUFBVSxFQUFFLE1BQU0sQ0FBQyxNQUFNO1lBQ3pCLE1BQU0sRUFBRSxJQUFJLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDO1NBQzNDLENBQUMsQ0FBQztJQUNMLENBQUM7SUFFRCxPQUFPLE1BQU0sQ0FBQztBQUNoQixDQUFDO0FBRUQsMkJBQTJCO0FBQzNCLEtBQUssVUFBVSxXQUFXLENBQUMsTUFBYyxFQUFFLE1BQW1CO0lBQzVELElBQUksTUFBTSxDQUFDLE1BQU0sS0FBSyxDQUFDO1FBQUUsT0FBTztJQUVoQyw4Q0FBOEM7SUFDOUMsTUFBTSxTQUFTLENBQUMsSUFBSSxDQUNsQixJQUFJLHlDQUF1QixDQUFDO1FBQzFCLFdBQVcsRUFBRSxxQkFBcUI7UUFDbEMsU0FBUyxFQUFFLG1CQUFtQjtRQUM5QixRQUFRLEVBQUUsYUFBYTtRQUN2QixHQUFHLEVBQUUscURBQXFEO1FBQzFELFVBQVUsRUFBRSxDQUFDLGtCQUFrQixDQUFDLFFBQVEsRUFBRSxNQUFNLENBQUMsQ0FBQztLQUNuRCxDQUFDLENBQ0gsQ0FBQztJQUVGLDBCQUEwQjtJQUMxQixNQUFNLGFBQWEsR0FBcUIsTUFBTSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDO1FBQzFELGtCQUFrQixDQUFDLFFBQVEsRUFBRSxNQUFNLENBQUM7UUFDcEMsa0JBQWtCLENBQUMsU0FBUyxFQUFFLEtBQUssQ0FBQyxPQUFPLENBQUM7UUFDNUMsa0JBQWtCLENBQUMsVUFBVSxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQzlELGtCQUFrQixDQUFDLFlBQVksRUFBRSxLQUFLLENBQUMsVUFBVSxDQUFDO1FBQ2xELGtCQUFrQixDQUFDLFFBQVEsRUFBRSxLQUFLLENBQUMsTUFBTSxJQUFJLElBQUksQ0FBQztLQUNuRCxDQUFDLENBQUM7SUFFSCx5REFBeUQ7SUFDekQsTUFBTSxTQUFTLEdBQUcsRUFBRSxDQUFDO0lBQ3JCLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxhQUFhLENBQUMsTUFBTSxFQUFFLENBQUMsSUFBSSxTQUFTLEVBQUUsQ0FBQztRQUN6RCxNQUFNLEtBQUssR0FBRyxhQUFhLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLEdBQUcsU0FBUyxDQUFDLENBQUM7UUFFcEQsTUFBTSxTQUFTLENBQUMsSUFBSSxDQUNsQixJQUFJLDhDQUE0QixDQUFDO1lBQy9CLFdBQVcsRUFBRSxxQkFBcUI7WUFDbEMsU0FBUyxFQUFFLG1CQUFtQjtZQUM5QixRQUFRLEVBQUUsYUFBYTtZQUN2QixHQUFHLEVBQUU7O2lGQUVvRTtZQUN6RSxhQUFhLEVBQUUsS0FBSztTQUNyQixDQUFDLENBQ0gsQ0FBQztJQUNKLENBQUM7QUFDSCxDQUFDO0FBRUQsZ0JBQWdCO0FBQ2hCLEtBQUssVUFBVSxVQUFVLENBQUMsR0FBcUI7SUFDN0MsT0FBTyxDQUFDLEdBQUcsQ0FBQyxtQkFBbUIsR0FBRyxDQUFDLEdBQUcsY0FBYyxHQUFHLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQztJQUVwRSxJQUFJLENBQUM7UUFDSCw4QkFBOEI7UUFDOUIsTUFBTSxnQkFBZ0IsQ0FBQyxHQUFHLENBQUMsTUFBTSxFQUFFLFlBQVksQ0FBQyxDQUFDO1FBQ2pELE1BQU0sZUFBZSxDQUFDLEdBQUcsQ0FBQyxLQUFLLEVBQUUsWUFBWSxFQUFFLEVBQUUsR0FBRyxFQUFFLEdBQUcsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxDQUFDO1FBRWpFLHFDQUFxQztRQUNyQyxNQUFNLE9BQU8sR0FBRyxNQUFNLHNCQUFzQixDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUV0RCxJQUFJLENBQUMsT0FBTyxJQUFJLE9BQU8sQ0FBQyxJQUFJLEVBQUUsQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFLENBQUM7WUFDNUMsTUFBTSxJQUFJLEtBQUssQ0FBQywrQkFBK0IsQ0FBQyxDQUFDO1FBQ25ELENBQUM7UUFFRCxhQUFhO1FBQ2IsTUFBTSxNQUFNLEdBQUcsU0FBUyxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQ2xDLE9BQU8sQ0FBQyxHQUFHLENBQUMsYUFBYSxNQUFNLENBQUMsTUFBTSxnQkFBZ0IsR0FBRyxDQUFDLEdBQUcsRUFBRSxDQUFDLENBQUM7UUFFakUsZUFBZTtRQUNmLE1BQU0sV0FBVyxDQUFDLEdBQUcsQ0FBQyxNQUFNLEVBQUUsTUFBTSxDQUFDLENBQUM7UUFFdEMsNkJBQTZCO1FBQzdCLE1BQU0sZ0JBQWdCLENBQUMsR0FBRyxDQUFDLE1BQU0sRUFBRSxXQUFXLENBQUMsQ0FBQztRQUNoRCxNQUFNLGVBQWUsQ0FBQyxHQUFHLENBQUMsS0FBSyxFQUFFLFdBQVcsRUFBRTtZQUM1QyxHQUFHLEVBQUUsR0FBRyxDQUFDLEdBQUc7WUFDWixhQUFhLEVBQUUsTUFBTSxDQUFDLE1BQU07WUFDNUIsV0FBVyxFQUFFLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQyxHQUFHLEVBQUUsS0FBSyxFQUFFLEVBQUUsQ0FBQyxHQUFHLEdBQUcsQ0FBQyxLQUFLLENBQUMsTUFBTSxJQUFJLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQztTQUN6RSxDQUFDLENBQUM7SUFFTCxDQUFDO0lBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztRQUNmLE9BQU8sQ0FBQyxLQUFLLENBQUMsd0JBQXdCLEdBQUcsQ0FBQyxHQUFHLEdBQUcsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUN6RCxNQUFNLFlBQVksR0FBRyxLQUFLLFlBQVksS0FBSyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxlQUFlLENBQUM7UUFFOUUsTUFBTSxnQkFBZ0IsQ0FBQyxHQUFHLENBQUMsTUFBTSxFQUFFLFFBQVEsRUFBRSxZQUFZLENBQUMsQ0FBQztRQUMzRCxNQUFNLGVBQWUsQ0FBQyxHQUFHLENBQUMsS0FBSyxFQUFFLFFBQVEsRUFBRSxFQUFFLEdBQUcsRUFBRSxHQUFHLENBQUMsR0FBRyxFQUFFLEVBQUUsWUFBWSxDQUFDLENBQUM7UUFFM0UsTUFBTSxLQUFLLENBQUMsQ0FBQyw0Q0FBNEM7SUFDM0QsQ0FBQztBQUNILENBQUM7QUFFRCwyQ0FBMkM7QUFDcEMsS0FBSyxVQUFVLE9BQU8sQ0FBQyxLQUE4QztJQUMxRSxPQUFPLENBQUMsR0FBRyxDQUFDLGlCQUFpQixFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsS0FBSyxFQUFFLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBRS9ELElBQUksQ0FBQztRQUNILHFEQUFxRDtRQUNyRCxJQUFJLE9BQU8sSUFBSSxLQUFLLElBQUksUUFBUSxJQUFJLEtBQUssSUFBSSxLQUFLLElBQUksS0FBSyxFQUFFLENBQUM7WUFDNUQsTUFBTSxVQUFVLENBQUMsS0FBeUIsQ0FBQyxDQUFDO1lBQzVDLE9BQU87Z0JBQ0wsVUFBVSxFQUFFLEdBQUc7Z0JBQ2YsSUFBSSxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsRUFBRSxPQUFPLEVBQUUsNEJBQTRCLEVBQUUsQ0FBQzthQUNoRSxDQUFDO1FBQ0osQ0FBQztRQUVELHlDQUF5QztRQUN6QyxNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFFLEtBQThCLENBQUMsSUFBSSxJQUFJLElBQUksQ0FBQyxDQUFDO1FBRXRFLElBQUksQ0FBQyxJQUFJLENBQUMsS0FBSyxJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQztZQUM3QyxPQUFPO2dCQUNMLFVBQVUsRUFBRSxHQUFHO2dCQUNmLElBQUksRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLEVBQUUsS0FBSyxFQUFFLDZDQUE2QyxFQUFFLENBQUM7YUFDL0UsQ0FBQztRQUNKLENBQUM7UUFFRCxNQUFNLFVBQVUsQ0FBQyxJQUF3QixDQUFDLENBQUM7UUFFM0MsT0FBTztZQUNMLFVBQVUsRUFBRSxHQUFHO1lBQ2YsSUFBSSxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsRUFBRSxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsQ0FBQztTQUM1RCxDQUFDO0lBRUosQ0FBQztJQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7UUFDZixPQUFPLENBQUMsS0FBSyxDQUFDLGdCQUFnQixFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ3ZDLE9BQU87WUFDTCxVQUFVLEVBQUUsR0FBRztZQUNmLElBQUksRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDO2dCQUNuQixLQUFLLEVBQUUsS0FBSyxZQUFZLEtBQUssQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsZUFBZTthQUNoRSxDQUFDO1NBQ0gsQ0FBQztJQUNKLENBQUM7QUFDSCxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgQVBJR2F0ZXdheVByb3h5RXZlbnQgfSBmcm9tICdhd3MtbGFtYmRhJztcbmltcG9ydCB7IFJEU0RhdGFDbGllbnQsIEV4ZWN1dGVTdGF0ZW1lbnRDb21tYW5kLCBCYXRjaEV4ZWN1dGVTdGF0ZW1lbnRDb21tYW5kLCBTcWxQYXJhbWV0ZXIgfSBmcm9tICdAYXdzLXNkay9jbGllbnQtcmRzLWRhdGEnO1xuaW1wb3J0IHsgRHluYW1vREJDbGllbnQsIFB1dEl0ZW1Db21tYW5kIH0gZnJvbSAnQGF3cy1zZGsvY2xpZW50LWR5bmFtb2RiJztcbmltcG9ydCBmZXRjaCBmcm9tICdub2RlLWZldGNoJztcbmltcG9ydCAqIGFzIGNoZWVyaW8gZnJvbSAnY2hlZXJpbyc7XG5pbXBvcnQgeyBtYXJrZWQgfSBmcm9tICdtYXJrZWQnO1xuXG5jb25zdCByZHNDbGllbnQgPSBuZXcgUkRTRGF0YUNsaWVudCh7fSk7XG5jb25zdCBkeW5hbW9DbGllbnQgPSBuZXcgRHluYW1vREJDbGllbnQoe30pO1xuXG5jb25zdCBKT0JfU1RBVFVTX1RBQkxFID0gcHJvY2Vzcy5lbnYuSk9CX1NUQVRVU19UQUJMRSE7XG5jb25zdCBEQVRBQkFTRV9SRVNPVVJDRV9BUk4gPSBwcm9jZXNzLmVudi5EQVRBQkFTRV9SRVNPVVJDRV9BUk4hO1xuY29uc3QgREFUQUJBU0VfU0VDUkVUX0FSTiA9IHByb2Nlc3MuZW52LkRBVEFCQVNFX1NFQ1JFVF9BUk4hO1xuY29uc3QgREFUQUJBU0VfTkFNRSA9IHByb2Nlc3MuZW52LkRBVEFCQVNFX05BTUUhO1xuXG4vLyBIZWxwZXIgZnVuY3Rpb24gdG8gY3JlYXRlIFNRTCBwYXJhbWV0ZXJzIHdpdGggcHJvcGVyIHR5cGVzXG5mdW5jdGlvbiBjcmVhdGVTcWxQYXJhbWV0ZXIobmFtZTogc3RyaW5nLCB2YWx1ZTogc3RyaW5nIHwgbnVtYmVyIHwgYm9vbGVhbiB8IG51bGwpOiBTcWxQYXJhbWV0ZXIge1xuICBpZiAodmFsdWUgPT09IG51bGwpIHtcbiAgICByZXR1cm4geyBuYW1lLCB2YWx1ZTogeyBpc051bGw6IHRydWUgfSB9O1xuICB9XG4gIGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnKSB7XG4gICAgcmV0dXJuIHsgbmFtZSwgdmFsdWU6IHsgc3RyaW5nVmFsdWU6IHZhbHVlIH0gfTtcbiAgfVxuICBpZiAodHlwZW9mIHZhbHVlID09PSAnbnVtYmVyJykge1xuICAgIHJldHVybiB7IG5hbWUsIHZhbHVlOiB7IGxvbmdWYWx1ZTogdmFsdWUgfSB9O1xuICB9XG4gIGlmICh0eXBlb2YgdmFsdWUgPT09ICdib29sZWFuJykge1xuICAgIHJldHVybiB7IG5hbWUsIHZhbHVlOiB7IGJvb2xlYW5WYWx1ZTogdmFsdWUgfSB9O1xuICB9XG4gIHRocm93IG5ldyBFcnJvcihgVW5zdXBwb3J0ZWQgcGFyYW1ldGVyIHR5cGUgZm9yICR7bmFtZX06ICR7dHlwZW9mIHZhbHVlfWApO1xufVxuXG5pbnRlcmZhY2UgVVJMUHJvY2Vzc2luZ0pvYiB7XG4gIGpvYklkOiBzdHJpbmc7XG4gIGl0ZW1JZDogbnVtYmVyO1xuICB1cmw6IHN0cmluZztcbiAgaXRlbU5hbWU6IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIENodW5rRGF0YSB7XG4gIGNvbnRlbnQ6IHN0cmluZztcbiAgbWV0YWRhdGE6IFJlY29yZDxzdHJpbmcsIGFueT47XG4gIGNodW5rSW5kZXg6IG51bWJlcjtcbiAgdG9rZW5zPzogbnVtYmVyO1xufVxuXG4vLyBVcGRhdGUgam9iIHN0YXR1cyBpbiBEeW5hbW9EQlxuYXN5bmMgZnVuY3Rpb24gdXBkYXRlSm9iU3RhdHVzKFxuICBqb2JJZDogc3RyaW5nLFxuICBzdGF0dXM6IHN0cmluZyxcbiAgZGV0YWlscz86IGFueSxcbiAgZXJyb3I/OiBzdHJpbmdcbikge1xuICBjb25zdCB0aW1lc3RhbXAgPSBEYXRlLm5vdygpO1xuICBjb25zdCB0dGwgPSBNYXRoLmZsb29yKHRpbWVzdGFtcCAvIDEwMDApICsgODY0MDAgKiA3OyAvLyA3IGRheXMgVFRMXG5cbiAgYXdhaXQgZHluYW1vQ2xpZW50LnNlbmQoXG4gICAgbmV3IFB1dEl0ZW1Db21tYW5kKHtcbiAgICAgIFRhYmxlTmFtZTogSk9CX1NUQVRVU19UQUJMRSxcbiAgICAgIEl0ZW06IHtcbiAgICAgICAgam9iSWQ6IHsgUzogam9iSWQgfSxcbiAgICAgICAgdGltZXN0YW1wOiB7IE46IHRpbWVzdGFtcC50b1N0cmluZygpIH0sXG4gICAgICAgIHN0YXR1czogeyBTOiBzdGF0dXMgfSxcbiAgICAgICAgZGV0YWlsczogZGV0YWlscyA/IHsgUzogSlNPTi5zdHJpbmdpZnkoZGV0YWlscykgfSA6IHsgTlVMTDogdHJ1ZSB9LFxuICAgICAgICBlcnJvcjogZXJyb3IgPyB7IFM6IGVycm9yIH0gOiB7IE5VTEw6IHRydWUgfSxcbiAgICAgICAgdHRsOiB7IE46IHR0bC50b1N0cmluZygpIH0sXG4gICAgICB9LFxuICAgIH0pXG4gICk7XG59XG5cbi8vIFVwZGF0ZSByZXBvc2l0b3J5IGl0ZW0gc3RhdHVzIGluIGRhdGFiYXNlXG5hc3luYyBmdW5jdGlvbiB1cGRhdGVJdGVtU3RhdHVzKFxuICBpdGVtSWQ6IG51bWJlcixcbiAgc3RhdHVzOiBzdHJpbmcsXG4gIGVycm9yPzogc3RyaW5nXG4pIHtcbiAgY29uc3Qgc3FsID0gZXJyb3JcbiAgICA/IGBVUERBVEUgcmVwb3NpdG9yeV9pdGVtcyBcbiAgICAgICBTRVQgcHJvY2Vzc2luZ19zdGF0dXMgPSA6c3RhdHVzLCBcbiAgICAgICAgICAgcHJvY2Vzc2luZ19lcnJvciA9IDplcnJvcixcbiAgICAgICAgICAgdXBkYXRlZF9hdCA9IENVUlJFTlRfVElNRVNUQU1QXG4gICAgICAgV0hFUkUgaWQgPSA6aXRlbUlkYFxuICAgIDogYFVQREFURSByZXBvc2l0b3J5X2l0ZW1zIFxuICAgICAgIFNFVCBwcm9jZXNzaW5nX3N0YXR1cyA9IDpzdGF0dXMsXG4gICAgICAgICAgIHByb2Nlc3NpbmdfZXJyb3IgPSBOVUxMLFxuICAgICAgICAgICB1cGRhdGVkX2F0ID0gQ1VSUkVOVF9USU1FU1RBTVBcbiAgICAgICBXSEVSRSBpZCA9IDppdGVtSWRgO1xuXG4gIGNvbnN0IHBhcmFtZXRlcnM6IFNxbFBhcmFtZXRlcltdID0gW1xuICAgIGNyZWF0ZVNxbFBhcmFtZXRlcignaXRlbUlkJywgaXRlbUlkKSxcbiAgICBjcmVhdGVTcWxQYXJhbWV0ZXIoJ3N0YXR1cycsIHN0YXR1cyksXG4gIF07XG5cbiAgaWYgKGVycm9yKSB7XG4gICAgcGFyYW1ldGVycy5wdXNoKGNyZWF0ZVNxbFBhcmFtZXRlcignZXJyb3InLCBlcnJvcikpO1xuICB9XG5cbiAgYXdhaXQgcmRzQ2xpZW50LnNlbmQoXG4gICAgbmV3IEV4ZWN1dGVTdGF0ZW1lbnRDb21tYW5kKHtcbiAgICAgIHJlc291cmNlQXJuOiBEQVRBQkFTRV9SRVNPVVJDRV9BUk4sXG4gICAgICBzZWNyZXRBcm46IERBVEFCQVNFX1NFQ1JFVF9BUk4sXG4gICAgICBkYXRhYmFzZTogREFUQUJBU0VfTkFNRSxcbiAgICAgIHNxbCxcbiAgICAgIHBhcmFtZXRlcnMsXG4gICAgfSlcbiAgKTtcbn1cblxuLy8gRmV0Y2ggYW5kIGV4dHJhY3QgdGV4dCBjb250ZW50IGZyb20gVVJMXG5hc3luYyBmdW5jdGlvbiBmZXRjaEFuZEV4dHJhY3RDb250ZW50KHVybDogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmc+IHtcbiAgdHJ5IHtcbiAgICAvLyBDcmVhdGUgYW4gQWJvcnRDb250cm9sbGVyIGZvciB0aW1lb3V0XG4gICAgY29uc3QgY29udHJvbGxlciA9IG5ldyBBYm9ydENvbnRyb2xsZXIoKTtcbiAgICBjb25zdCB0aW1lb3V0ID0gc2V0VGltZW91dCgoKSA9PiBjb250cm9sbGVyLmFib3J0KCksIDMwMDAwKTsgLy8gMzAgc2Vjb25kc1xuXG4gICAgdHJ5IHtcbiAgICAgIC8vIEZldGNoIHRoZSBVUkwgd2l0aCBhIHRpbWVvdXRcbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2godXJsLCB7XG4gICAgICAgIHNpZ25hbDogY29udHJvbGxlci5zaWduYWwsXG4gICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICAnVXNlci1BZ2VudCc6ICdNb3ppbGxhLzUuMCAoY29tcGF0aWJsZTsgQUlTdHVkaW9Cb3QvMS4wOyAraHR0cHM6Ly9haXN0dWRpby5wc2Q0MDEuYWkpJyxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuICAgICAgXG4gICAgICBjbGVhclRpbWVvdXQodGltZW91dCk7XG5cbiAgICAgIGlmICghcmVzcG9uc2Uub2spIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBIVFRQIGVycm9yISBzdGF0dXM6ICR7cmVzcG9uc2Uuc3RhdHVzfWApO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBjb250ZW50VHlwZSA9IHJlc3BvbnNlLmhlYWRlcnMuZ2V0KCdjb250ZW50LXR5cGUnKSB8fCAnJztcbiAgICAgIGNvbnN0IGh0bWwgPSBhd2FpdCByZXNwb25zZS50ZXh0KCk7XG5cbiAgICAgIC8vIFBhcnNlIEhUTUwgYW5kIGV4dHJhY3QgdGV4dFxuICAgICAgY29uc3QgJCA9IGNoZWVyaW8ubG9hZChodG1sKTtcblxuICAgICAgLy8gUmVtb3ZlIHNjcmlwdCBhbmQgc3R5bGUgZWxlbWVudHNcbiAgICAgICQoJ3NjcmlwdCwgc3R5bGUsIG5vc2NyaXB0JykucmVtb3ZlKCk7XG5cbiAgICAgIC8vIFRyeSB0byBmaW5kIG1haW4gY29udGVudCBhcmVhc1xuICAgICAgbGV0IGNvbnRlbnQgPSAnJztcbiAgICBcbiAgICAgIC8vIENvbW1vbiBjb250ZW50IHNlbGVjdG9yc1xuICAgICAgY29uc3QgY29udGVudFNlbGVjdG9ycyA9IFtcbiAgICAgICdtYWluJyxcbiAgICAgICdhcnRpY2xlJyxcbiAgICAgICdbcm9sZT1cIm1haW5cIl0nLFxuICAgICAgJy5jb250ZW50JyxcbiAgICAgICcjY29udGVudCcsXG4gICAgICAnLnBvc3QnLFxuICAgICAgJy5lbnRyeS1jb250ZW50JyxcbiAgICAgICcuYXJ0aWNsZS1jb250ZW50JyxcbiAgICBdO1xuXG4gICAgICBmb3IgKGNvbnN0IHNlbGVjdG9yIG9mIGNvbnRlbnRTZWxlY3RvcnMpIHtcbiAgICAgICAgY29uc3QgZWxlbWVudCA9ICQoc2VsZWN0b3IpO1xuICAgICAgICBpZiAoZWxlbWVudC5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgY29udGVudCA9IGVsZW1lbnQudGV4dCgpO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIC8vIElmIG5vIHNwZWNpZmljIGNvbnRlbnQgYXJlYSBmb3VuZCwgZ2V0IGFsbCB0ZXh0XG4gICAgICBpZiAoIWNvbnRlbnQpIHtcbiAgICAgICAgY29udGVudCA9ICQoJ2JvZHknKS50ZXh0KCk7XG4gICAgICB9XG5cbiAgICAgIC8vIENsZWFuIHVwIHRoZSB0ZXh0XG4gICAgICBjb250ZW50ID0gY29udGVudFxuICAgICAgLnJlcGxhY2UoL1xccysvZywgJyAnKSAvLyBSZXBsYWNlIG11bHRpcGxlIHdoaXRlc3BhY2Ugd2l0aCBzaW5nbGUgc3BhY2VcbiAgICAgIC5yZXBsYWNlKC9cXG57Myx9L2csICdcXG5cXG4nKSAvLyBSZXBsYWNlIG11bHRpcGxlIG5ld2xpbmVzIHdpdGggZG91YmxlIG5ld2xpbmVcbiAgICAgIC50cmltKCk7XG5cbiAgICAgIC8vIElmIGNvbnRlbnQgaXMgbWFya2Rvd24gb3IgaGFzIG1hcmtkb3duLWxpa2UgY29udGVudCwgcHJvY2VzcyBpdFxuICAgICAgaWYgKGNvbnRlbnRUeXBlLmluY2x1ZGVzKCdtYXJrZG93bicpIHx8IHVybC5lbmRzV2l0aCgnLm1kJykpIHtcbiAgICAgICAgY29uc3QgaHRtbENvbnRlbnQgPSBhd2FpdCBtYXJrZWQucGFyc2UoY29udGVudCk7XG4gICAgICAgIGNvbnRlbnQgPSBodG1sQ29udGVudC5yZXBsYWNlKC88W14+XSo+L2csICcnKS50cmltKCk7XG4gICAgICB9XG5cbiAgICAgIC8vIEV4dHJhY3QgbWV0YWRhdGFcbiAgICAgIGNvbnN0IHRpdGxlID0gJCgndGl0bGUnKS50ZXh0KCkgfHwgJCgnaDEnKS5maXJzdCgpLnRleHQoKSB8fCAnJztcbiAgICAgIGNvbnN0IGRlc2NyaXB0aW9uID0gJCgnbWV0YVtuYW1lPVwiZGVzY3JpcHRpb25cIl0nKS5hdHRyKCdjb250ZW50JykgfHwgXG4gICAgICAgICAgICAgICAgICAgICAgICAgJCgnbWV0YVtwcm9wZXJ0eT1cIm9nOmRlc2NyaXB0aW9uXCJdJykuYXR0cignY29udGVudCcpIHx8ICcnO1xuXG4gICAgICAvLyBQcmVwZW5kIG1ldGFkYXRhIHRvIGNvbnRlbnRcbiAgICAgIGlmICh0aXRsZSkge1xuICAgICAgICBjb250ZW50ID0gYFRpdGxlOiAke3RpdGxlfVxcblxcbiR7Y29udGVudH1gO1xuICAgICAgfVxuICAgICAgaWYgKGRlc2NyaXB0aW9uKSB7XG4gICAgICAgIGNvbnRlbnQgPSBgRGVzY3JpcHRpb246ICR7ZGVzY3JpcHRpb259XFxuXFxuJHtjb250ZW50fWA7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBjb250ZW50O1xuICAgIH0gY2F0Y2ggKGZldGNoRXJyb3I6IGFueSkge1xuICAgICAgY2xlYXJUaW1lb3V0KHRpbWVvdXQpO1xuICAgICAgaWYgKGZldGNoRXJyb3IubmFtZSA9PT0gJ0Fib3J0RXJyb3InKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignUmVxdWVzdCB0aW1lb3V0IGFmdGVyIDMwIHNlY29uZHMnKTtcbiAgICAgIH1cbiAgICAgIHRocm93IGZldGNoRXJyb3I7XG4gICAgfVxuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIGZldGNoaW5nIFVSTDonLCBlcnJvcik7XG4gICAgdGhyb3cgbmV3IEVycm9yKGBGYWlsZWQgdG8gZmV0Y2ggVVJMOiAke2Vycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogJ1Vua25vd24gZXJyb3InfWApO1xuICB9XG59XG5cbi8vIEludGVsbGlnZW50IHRleHQgY2h1bmtpbmcgKHNhbWUgYXMgZmlsZSBwcm9jZXNzb3IpXG5mdW5jdGlvbiBjaHVua1RleHQodGV4dDogc3RyaW5nLCBtYXhDaHVua1NpemU6IG51bWJlciA9IDIwMDApOiBDaHVua0RhdGFbXSB7XG4gIGNvbnN0IGNodW5rczogQ2h1bmtEYXRhW10gPSBbXTtcbiAgY29uc3QgbGluZXMgPSB0ZXh0LnNwbGl0KCdcXG4nKTtcbiAgbGV0IGN1cnJlbnRDaHVuayA9ICcnO1xuICBsZXQgY2h1bmtJbmRleCA9IDA7XG4gIFxuICBmb3IgKGNvbnN0IGxpbmUgb2YgbGluZXMpIHtcbiAgICBpZiAoKGN1cnJlbnRDaHVuayArIGxpbmUpLmxlbmd0aCA+IG1heENodW5rU2l6ZSAmJiBjdXJyZW50Q2h1bmsubGVuZ3RoID4gMCkge1xuICAgICAgY2h1bmtzLnB1c2goe1xuICAgICAgICBjb250ZW50OiBjdXJyZW50Q2h1bmsudHJpbSgpLFxuICAgICAgICBtZXRhZGF0YTogeyBsaW5lU3RhcnQ6IGNodW5rSW5kZXggfSxcbiAgICAgICAgY2h1bmtJbmRleDogY2h1bmtzLmxlbmd0aCxcbiAgICAgICAgdG9rZW5zOiBNYXRoLmNlaWwoY3VycmVudENodW5rLmxlbmd0aCAvIDQpLCAvLyBSb3VnaCB0b2tlbiBlc3RpbWF0ZVxuICAgICAgfSk7XG4gICAgICBjdXJyZW50Q2h1bmsgPSBsaW5lICsgJ1xcbic7XG4gICAgfSBlbHNlIHtcbiAgICAgIGN1cnJlbnRDaHVuayArPSBsaW5lICsgJ1xcbic7XG4gICAgfVxuICB9XG4gIFxuICBpZiAoY3VycmVudENodW5rLnRyaW0oKS5sZW5ndGggPiAwKSB7XG4gICAgY2h1bmtzLnB1c2goe1xuICAgICAgY29udGVudDogY3VycmVudENodW5rLnRyaW0oKSxcbiAgICAgIG1ldGFkYXRhOiB7IGxpbmVTdGFydDogY2h1bmtJbmRleCB9LFxuICAgICAgY2h1bmtJbmRleDogY2h1bmtzLmxlbmd0aCxcbiAgICAgIHRva2VuczogTWF0aC5jZWlsKGN1cnJlbnRDaHVuay5sZW5ndGggLyA0KSxcbiAgICB9KTtcbiAgfVxuICBcbiAgcmV0dXJuIGNodW5rcztcbn1cblxuLy8gU3RvcmUgY2h1bmtzIGluIGRhdGFiYXNlXG5hc3luYyBmdW5jdGlvbiBzdG9yZUNodW5rcyhpdGVtSWQ6IG51bWJlciwgY2h1bmtzOiBDaHVua0RhdGFbXSkge1xuICBpZiAoY2h1bmtzLmxlbmd0aCA9PT0gMCkgcmV0dXJuO1xuICBcbiAgLy8gRmlyc3QsIGRlbGV0ZSBleGlzdGluZyBjaHVua3MgZm9yIHRoaXMgaXRlbVxuICBhd2FpdCByZHNDbGllbnQuc2VuZChcbiAgICBuZXcgRXhlY3V0ZVN0YXRlbWVudENvbW1hbmQoe1xuICAgICAgcmVzb3VyY2VBcm46IERBVEFCQVNFX1JFU09VUkNFX0FSTixcbiAgICAgIHNlY3JldEFybjogREFUQUJBU0VfU0VDUkVUX0FSTixcbiAgICAgIGRhdGFiYXNlOiBEQVRBQkFTRV9OQU1FLFxuICAgICAgc3FsOiAnREVMRVRFIEZST00gZG9jdW1lbnRfY2h1bmtzIFdIRVJFIGl0ZW1faWQgPSA6aXRlbUlkJyxcbiAgICAgIHBhcmFtZXRlcnM6IFtjcmVhdGVTcWxQYXJhbWV0ZXIoJ2l0ZW1JZCcsIGl0ZW1JZCldLFxuICAgIH0pXG4gICk7XG4gIFxuICAvLyBCYXRjaCBpbnNlcnQgbmV3IGNodW5rc1xuICBjb25zdCBwYXJhbWV0ZXJTZXRzOiBTcWxQYXJhbWV0ZXJbXVtdID0gY2h1bmtzLm1hcChjaHVuayA9PiBbXG4gICAgY3JlYXRlU3FsUGFyYW1ldGVyKCdpdGVtSWQnLCBpdGVtSWQpLFxuICAgIGNyZWF0ZVNxbFBhcmFtZXRlcignY29udGVudCcsIGNodW5rLmNvbnRlbnQpLFxuICAgIGNyZWF0ZVNxbFBhcmFtZXRlcignbWV0YWRhdGEnLCBKU09OLnN0cmluZ2lmeShjaHVuay5tZXRhZGF0YSkpLFxuICAgIGNyZWF0ZVNxbFBhcmFtZXRlcignY2h1bmtJbmRleCcsIGNodW5rLmNodW5rSW5kZXgpLFxuICAgIGNyZWF0ZVNxbFBhcmFtZXRlcigndG9rZW5zJywgY2h1bmsudG9rZW5zID8/IG51bGwpLFxuICBdKTtcbiAgXG4gIC8vIEJhdGNoRXhlY3V0ZVN0YXRlbWVudCBoYXMgYSBsaW1pdCBvZiAyNSBwYXJhbWV0ZXIgc2V0c1xuICBjb25zdCBiYXRjaFNpemUgPSAyNTtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBwYXJhbWV0ZXJTZXRzLmxlbmd0aDsgaSArPSBiYXRjaFNpemUpIHtcbiAgICBjb25zdCBiYXRjaCA9IHBhcmFtZXRlclNldHMuc2xpY2UoaSwgaSArIGJhdGNoU2l6ZSk7XG4gICAgXG4gICAgYXdhaXQgcmRzQ2xpZW50LnNlbmQoXG4gICAgICBuZXcgQmF0Y2hFeGVjdXRlU3RhdGVtZW50Q29tbWFuZCh7XG4gICAgICAgIHJlc291cmNlQXJuOiBEQVRBQkFTRV9SRVNPVVJDRV9BUk4sXG4gICAgICAgIHNlY3JldEFybjogREFUQUJBU0VfU0VDUkVUX0FSTixcbiAgICAgICAgZGF0YWJhc2U6IERBVEFCQVNFX05BTUUsXG4gICAgICAgIHNxbDogYElOU0VSVCBJTlRPIGRvY3VtZW50X2NodW5rcyBcbiAgICAgICAgICAgICAgKGl0ZW1faWQsIGNvbnRlbnQsIG1ldGFkYXRhLCBjaHVua19pbmRleCwgdG9rZW5zKVxuICAgICAgICAgICAgICBWQUxVRVMgKDppdGVtSWQsIDpjb250ZW50LCA6bWV0YWRhdGE6Ompzb25iLCA6Y2h1bmtJbmRleCwgOnRva2VucylgLFxuICAgICAgICBwYXJhbWV0ZXJTZXRzOiBiYXRjaCxcbiAgICAgIH0pXG4gICAgKTtcbiAgfVxufVxuXG4vLyBQcm9jZXNzIGEgVVJMXG5hc3luYyBmdW5jdGlvbiBwcm9jZXNzVVJMKGpvYjogVVJMUHJvY2Vzc2luZ0pvYikge1xuICBjb25zb2xlLmxvZyhgUHJvY2Vzc2luZyBVUkw6ICR7am9iLnVybH0gZm9yIGl0ZW06ICR7am9iLml0ZW1OYW1lfWApO1xuICBcbiAgdHJ5IHtcbiAgICAvLyBVcGRhdGUgc3RhdHVzIHRvIHByb2Nlc3NpbmdcbiAgICBhd2FpdCB1cGRhdGVJdGVtU3RhdHVzKGpvYi5pdGVtSWQsICdwcm9jZXNzaW5nJyk7XG4gICAgYXdhaXQgdXBkYXRlSm9iU3RhdHVzKGpvYi5qb2JJZCwgJ3Byb2Nlc3NpbmcnLCB7IHVybDogam9iLnVybCB9KTtcbiAgICBcbiAgICAvLyBGZXRjaCBhbmQgZXh0cmFjdCBjb250ZW50IGZyb20gVVJMXG4gICAgY29uc3QgY29udGVudCA9IGF3YWl0IGZldGNoQW5kRXh0cmFjdENvbnRlbnQoam9iLnVybCk7XG4gICAgXG4gICAgaWYgKCFjb250ZW50IHx8IGNvbnRlbnQudHJpbSgpLmxlbmd0aCA9PT0gMCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdObyBjb250ZW50IGV4dHJhY3RlZCBmcm9tIFVSTCcpO1xuICAgIH1cbiAgICBcbiAgICAvLyBDaHVuayB0ZXh0XG4gICAgY29uc3QgY2h1bmtzID0gY2h1bmtUZXh0KGNvbnRlbnQpO1xuICAgIGNvbnNvbGUubG9nKGBFeHRyYWN0ZWQgJHtjaHVua3MubGVuZ3RofSBjaHVua3MgZnJvbSAke2pvYi51cmx9YCk7XG4gICAgXG4gICAgLy8gU3RvcmUgY2h1bmtzXG4gICAgYXdhaXQgc3RvcmVDaHVua3Moam9iLml0ZW1JZCwgY2h1bmtzKTtcbiAgICBcbiAgICAvLyBVcGRhdGUgc3RhdHVzIHRvIGNvbXBsZXRlZFxuICAgIGF3YWl0IHVwZGF0ZUl0ZW1TdGF0dXMoam9iLml0ZW1JZCwgJ2NvbXBsZXRlZCcpO1xuICAgIGF3YWl0IHVwZGF0ZUpvYlN0YXR1cyhqb2Iuam9iSWQsICdjb21wbGV0ZWQnLCB7XG4gICAgICB1cmw6IGpvYi51cmwsXG4gICAgICBjaHVua3NDcmVhdGVkOiBjaHVua3MubGVuZ3RoLFxuICAgICAgdG90YWxUb2tlbnM6IGNodW5rcy5yZWR1Y2UoKHN1bSwgY2h1bmspID0+IHN1bSArIChjaHVuay50b2tlbnMgfHwgMCksIDApLFxuICAgIH0pO1xuICAgIFxuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoYEVycm9yIHByb2Nlc3NpbmcgVVJMICR7am9iLnVybH06YCwgZXJyb3IpO1xuICAgIGNvbnN0IGVycm9yTWVzc2FnZSA9IGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogJ1Vua25vd24gZXJyb3InO1xuICAgIFxuICAgIGF3YWl0IHVwZGF0ZUl0ZW1TdGF0dXMoam9iLml0ZW1JZCwgJ2ZhaWxlZCcsIGVycm9yTWVzc2FnZSk7XG4gICAgYXdhaXQgdXBkYXRlSm9iU3RhdHVzKGpvYi5qb2JJZCwgJ2ZhaWxlZCcsIHsgdXJsOiBqb2IudXJsIH0sIGVycm9yTWVzc2FnZSk7XG4gICAgXG4gICAgdGhyb3cgZXJyb3I7IC8vIFJlLXRocm93IHRvIGxldCBMYW1iZGEgaGFuZGxlIHJldHJ5IGxvZ2ljXG4gIH1cbn1cblxuLy8gTGFtYmRhIGhhbmRsZXIgLSBjYW4gYmUgaW52b2tlZCBkaXJlY3RseVxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGhhbmRsZXIoZXZlbnQ6IEFQSUdhdGV3YXlQcm94eUV2ZW50IHwgVVJMUHJvY2Vzc2luZ0pvYikge1xuICBjb25zb2xlLmxvZygnUmVjZWl2ZWQgZXZlbnQ6JywgSlNPTi5zdHJpbmdpZnkoZXZlbnQsIG51bGwsIDIpKTtcbiAgXG4gIHRyeSB7XG4gICAgLy8gQ2hlY2sgaWYgdGhpcyBpcyBhIGRpcmVjdCBpbnZvY2F0aW9uIHdpdGggam9iIGRhdGFcbiAgICBpZiAoJ2pvYklkJyBpbiBldmVudCAmJiAnaXRlbUlkJyBpbiBldmVudCAmJiAndXJsJyBpbiBldmVudCkge1xuICAgICAgYXdhaXQgcHJvY2Vzc1VSTChldmVudCBhcyBVUkxQcm9jZXNzaW5nSm9iKTtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN0YXR1c0NvZGU6IDIwMCxcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBtZXNzYWdlOiAnVVJMIHByb2Nlc3NlZCBzdWNjZXNzZnVsbHknIH0pLFxuICAgICAgfTtcbiAgICB9XG4gICAgXG4gICAgLy8gT3RoZXJ3aXNlLCBoYW5kbGUgYXMgQVBJIEdhdGV3YXkgZXZlbnRcbiAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZSgoZXZlbnQgYXMgQVBJR2F0ZXdheVByb3h5RXZlbnQpLmJvZHkgfHwgJ3t9Jyk7XG4gICAgXG4gICAgaWYgKCFib2R5LmpvYklkIHx8ICFib2R5Lml0ZW1JZCB8fCAhYm9keS51cmwpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN0YXR1c0NvZGU6IDQwMCxcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBlcnJvcjogJ01pc3NpbmcgcmVxdWlyZWQgZmllbGRzOiBqb2JJZCwgaXRlbUlkLCB1cmwnIH0pLFxuICAgICAgfTtcbiAgICB9XG4gICAgXG4gICAgYXdhaXQgcHJvY2Vzc1VSTChib2R5IGFzIFVSTFByb2Nlc3NpbmdKb2IpO1xuICAgIFxuICAgIHJldHVybiB7XG4gICAgICBzdGF0dXNDb2RlOiAyMDAsXG4gICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IG1lc3NhZ2U6ICdVUkwgcHJvY2Vzc2luZyBzdGFydGVkJyB9KSxcbiAgICB9O1xuICAgIFxuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ0hhbmRsZXIgZXJyb3I6JywgZXJyb3IpO1xuICAgIHJldHVybiB7XG4gICAgICBzdGF0dXNDb2RlOiA1MDAsXG4gICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IFxuICAgICAgICBlcnJvcjogZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiAnVW5rbm93biBlcnJvcicgXG4gICAgICB9KSxcbiAgICB9O1xuICB9XG59Il19