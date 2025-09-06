"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TextProcessor = void 0;
const sync_1 = require("csv-parse/sync");
const marked_1 = require("marked");
const lambda_logger_1 = require("../utils/lambda-logger");
/**
 * Securely removes HTML tags to prevent injection attacks
 * This function handles malformed HTML and prevents bypassing attempts
 */
function sanitizeHTML(html) {
    // First, iteratively remove HTML tags until none remain
    // This prevents bypassing through nested or malformed tags
    let sanitized = html;
    let previousLength = 0;
    while (sanitized.length !== previousLength && /<[^>]*>/g.test(sanitized)) {
        previousLength = sanitized.length;
        sanitized = sanitized.replace(/<[^>]*>/g, ' ');
    }
    // AFTER tags are removed, safely decode HTML entities (prevents security bypass)
    sanitized = sanitized
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#x27;/g, "'")
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, '&');
    // Clean up extra whitespace created by tag removal
    sanitized = sanitized
        .replace(/\s+/g, ' ')
        .trim();
    return sanitized;
}
class TextProcessor {
    constructor(config) {
        this.config = config;
    }
    async process(params) {
        const startTime = Date.now();
        const { buffer, fileName, fileType, onProgress } = params;
        const logger = (0, lambda_logger_1.createLambdaLogger)({
            operation: 'TextProcessor.process',
            fileName,
            fileType,
            fileSize: buffer.length
        });
        logger.info('Starting text document processing', { fileName, fileType, bufferSize: buffer.length });
        await onProgress?.('parsing_text', 40);
        const textContent = buffer.toString('utf-8');
        let extractedContent;
        try {
            // Determine specific text format
            const extension = fileName.split('.').pop()?.toLowerCase() || '';
            switch (extension) {
                case 'csv':
                    extractedContent = await this.processCsv(textContent);
                    break;
                case 'md':
                case 'markdown':
                    extractedContent = await this.processMarkdown(textContent);
                    break;
                case 'json':
                    extractedContent = await this.processJson(textContent);
                    break;
                case 'xml':
                    extractedContent = await this.processXml(textContent);
                    break;
                default:
                    extractedContent = await this.processPlainText(textContent);
            }
        }
        catch (error) {
            logger.error('Error processing text document', error);
            throw new Error(`Failed to process text: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
        if (!extractedContent.text) {
            throw new Error('No text content extracted from document');
        }
        await onProgress?.('post_processing', 70);
        // Build result
        const result = {
            text: extractedContent.text,
            metadata: {
                extractionMethod: extractedContent.method || 'text-processor',
                processingTime: Date.now() - startTime,
                originalSize: buffer.length,
                encoding: 'utf-8',
                ...extractedContent.metadata,
            }
        };
        // Convert to Markdown if requested (and not already markdown)
        if (this.config.convertToMarkdown && extractedContent.method !== 'markdown') {
            await onProgress?.('converting_markdown', 80);
            result.markdown = await this.convertToMarkdown(extractedContent);
        }
        else if (extractedContent.markdown) {
            result.markdown = extractedContent.markdown;
        }
        // Generate chunks if requested
        if (this.config.generateEmbeddings) {
            await onProgress?.('chunking_text', 90);
            result.chunks = await this.chunkText(extractedContent.text);
        }
        result.metadata.processingTime = Date.now() - startTime;
        logger.info('Text processing completed successfully', {
            processingTime: result.metadata.processingTime,
            textLength: result.text?.length || 0,
            hasMarkdown: !!result.markdown,
            chunkCount: result.chunks?.length || 0,
            extractionMethod: result.metadata.extractionMethod
        });
        return result;
    }
    async processCsv(content) {
        const logger = (0, lambda_logger_1.createLambdaLogger)({ operation: 'TextProcessor.processCsv' });
        logger.info('Processing CSV content');
        try {
            const records = (0, sync_1.parse)(content, {
                columns: true,
                skip_empty_lines: true,
                trim: true,
            });
            // Convert CSV to readable text format
            let textOutput = '';
            if (records.length > 0) {
                // Add header
                const headers = Object.keys(records[0]);
                textOutput += `CSV Data (${records.length} records)\n\n`;
                textOutput += `Columns: ${headers.join(', ')}\n\n`;
                // Add sample records (limit to first 10)
                const sampleRecords = records.slice(0, 10);
                sampleRecords.forEach((record, index) => {
                    textOutput += `Record ${index + 1}:\n`;
                    headers.forEach(header => {
                        textOutput += `  ${header}: ${record[header] || 'N/A'}\n`;
                    });
                    textOutput += '\n';
                });
                if (records.length > 10) {
                    textOutput += `... and ${records.length - 10} more records\n`;
                }
            }
            return {
                text: textOutput.trim(),
                method: 'csv',
                rawData: records,
                metadata: {
                    recordCount: records.length,
                    columns: records.length > 0 ? Object.keys(records[0]) : [],
                    format: 'csv',
                }
            };
        }
        catch (error) {
            logger.warn('Failed to parse as CSV, treating as plain text', { error });
            return this.processPlainText(content);
        }
    }
    async processMarkdown(content) {
        const logger = (0, lambda_logger_1.createLambdaLogger)({ operation: 'TextProcessor.processMarkdown' });
        logger.info('Processing Markdown content');
        try {
            // Convert markdown to plain text for text field
            const html = await marked_1.marked.parse(content);
            const plainText = sanitizeHTML(html).trim();
            return {
                text: plainText,
                markdown: content,
                method: 'markdown',
                metadata: {
                    originalMarkdown: true,
                    format: 'markdown',
                    estimatedWords: plainText.split(/\s+/).length,
                }
            };
        }
        catch (error) {
            logger.warn('Failed to parse markdown, treating as plain text', { error });
            return this.processPlainText(content);
        }
    }
    async processJson(content) {
        const logger = (0, lambda_logger_1.createLambdaLogger)({ operation: 'TextProcessor.processJson' });
        logger.info('Processing JSON content');
        try {
            const data = JSON.parse(content);
            // Convert JSON to readable text format
            const textOutput = this.jsonToText(data);
            return {
                text: textOutput,
                method: 'json',
                rawData: data,
                metadata: {
                    format: 'json',
                    dataType: Array.isArray(data) ? 'array' : typeof data,
                    size: Array.isArray(data) ? data.length : Object.keys(data).length,
                }
            };
        }
        catch (error) {
            logger.warn('Failed to parse as JSON, treating as plain text', { error });
            return this.processPlainText(content);
        }
    }
    async processXml(content) {
        const logger = (0, lambda_logger_1.createLambdaLogger)({ operation: 'TextProcessor.processXml' });
        logger.info('Processing XML content');
        // Basic XML text extraction (strip tags)
        const textContent = content
            .replace(/<[^>]*>/g, ' ') // Remove XML tags
            .replace(/\s+/g, ' ') // Normalize whitespace
            .trim();
        return {
            text: textContent,
            method: 'xml',
            metadata: {
                format: 'xml',
                originalLength: content.length,
                extractedLength: textContent.length,
            }
        };
    }
    async processPlainText(content) {
        const logger = (0, lambda_logger_1.createLambdaLogger)({ operation: 'TextProcessor.processPlainText' });
        logger.info('Processing plain text content');
        // Clean up the text
        const cleanedText = content
            .replace(/\r\n/g, '\n') // Normalize line endings
            .replace(/\r/g, '\n')
            .replace(/\t/g, '    ') // Replace tabs with spaces
            .trim();
        const lines = cleanedText.split('\n');
        const words = cleanedText.split(/\s+/).filter(word => word.length > 0);
        return {
            text: cleanedText,
            method: 'plain-text',
            metadata: {
                format: 'text/plain',
                lineCount: lines.length,
                wordCount: words.length,
                characterCount: cleanedText.length,
                averageWordsPerLine: lines.length > 0 ? Math.round(words.length / lines.length) : 0,
            }
        };
    }
    jsonToText(data, indent = 0) {
        const spaces = '  '.repeat(indent);
        if (Array.isArray(data)) {
            if (data.length === 0)
                return 'Empty array';
            let result = `Array with ${data.length} items:\n`;
            data.slice(0, 5).forEach((item, index) => {
                result += `${spaces}  ${index}: ${this.jsonToText(item, indent + 1)}\n`;
            });
            if (data.length > 5) {
                result += `${spaces}  ... and ${data.length - 5} more items\n`;
            }
            return result;
        }
        if (typeof data === 'object' && data !== null) {
            const keys = Object.keys(data);
            if (keys.length === 0)
                return 'Empty object';
            let result = '';
            keys.slice(0, 10).forEach(key => {
                const value = data[key];
                if (typeof value === 'object') {
                    result += `${spaces}${key}: ${this.jsonToText(value, indent + 1)}\n`;
                }
                else {
                    result += `${spaces}${key}: ${String(value)}\n`;
                }
            });
            if (keys.length > 10) {
                result += `${spaces}... and ${keys.length - 10} more properties\n`;
            }
            return result;
        }
        return String(data);
    }
    async convertToMarkdown(extractedContent) {
        const text = extractedContent.text;
        const method = extractedContent.method;
        switch (method) {
            case 'csv':
                return this.csvToMarkdown(extractedContent);
            case 'json':
                return this.jsonToMarkdown(extractedContent);
            case 'xml':
                return this.xmlToMarkdown(extractedContent);
            default:
                return this.textToMarkdown(text);
        }
    }
    csvToMarkdown(content) {
        if (!content.rawData || content.rawData.length === 0) {
            return '# CSV Data\n\nNo data found.';
        }
        const records = content.rawData;
        const headers = Object.keys(records[0]);
        let markdown = `# CSV Data\n\n**${records.length} records** with columns: ${headers.join(', ')}\n\n`;
        // Create table (limit to first 20 records)
        const displayRecords = records.slice(0, 20);
        markdown += '| ' + headers.join(' | ') + ' |\n';
        markdown += '| ' + headers.map(() => '---').join(' | ') + ' |\n';
        displayRecords.forEach((record) => {
            const row = headers.map(header => {
                const cellValue = String(record[header] || '');
                // Properly escape both backslashes and pipe characters for markdown table
                return cellValue.replace(/\\/g, '\\\\').replace(/\|/g, '\\|');
            });
            markdown += '| ' + row.join(' | ') + ' |\n';
        });
        if (records.length > 20) {
            markdown += `\n*... and ${records.length - 20} more records*\n`;
        }
        return markdown;
    }
    jsonToMarkdown(content) {
        let markdown = '# JSON Data\n\n';
        if (content.rawData) {
            const data = content.rawData;
            if (Array.isArray(data)) {
                markdown += `**Array with ${data.length} items**\n\n`;
                markdown += '```json\n';
                markdown += JSON.stringify(data.slice(0, 3), null, 2);
                if (data.length > 3) {
                    markdown += '\n// ... and ' + (data.length - 3) + ' more items';
                }
                markdown += '\n```\n';
            }
            else {
                markdown += '**Object Data**\n\n';
                markdown += '```json\n';
                markdown += JSON.stringify(data, null, 2);
                markdown += '\n```\n';
            }
        }
        return markdown;
    }
    xmlToMarkdown(content) {
        return `# XML Document\n\n${content.text}`;
    }
    textToMarkdown(text) {
        // Simple text to markdown conversion
        const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
        let markdown = '';
        for (const paragraph of paragraphs) {
            const trimmed = paragraph.trim();
            // Detect potential headers
            if (trimmed.length < 100 && !/[.!?]$/.test(trimmed) && /^[A-Z]/.test(trimmed)) {
                const words = trimmed.split(' ');
                if (words.length <= 10) {
                    markdown += `## ${trimmed}\n\n`;
                    continue;
                }
            }
            // Regular paragraph
            markdown += `${trimmed}\n\n`;
        }
        return markdown.trim() || text;
    }
    async chunkText(text) {
        const chunkSize = 2000;
        const overlap = 200;
        const chunks = [];
        let startIndex = 0;
        let chunkIndex = 0;
        while (startIndex < text.length) {
            let endIndex = Math.min(startIndex + chunkSize, text.length);
            // Try to break at sentence or line boundary
            if (endIndex < text.length) {
                const lastSentenceEnd = text.lastIndexOf('.', endIndex);
                const lastLineEnd = text.lastIndexOf('\n', endIndex);
                const breakPoint = Math.max(lastSentenceEnd, lastLineEnd);
                if (breakPoint > startIndex) {
                    endIndex = breakPoint + 1;
                }
            }
            const chunkContent = text.substring(startIndex, endIndex).trim();
            if (chunkContent.length > 0) {
                chunks.push({
                    chunkIndex,
                    content: chunkContent,
                    metadata: {
                        startIndex,
                        endIndex,
                        length: chunkContent.length,
                        type: 'text',
                    },
                });
                chunkIndex++;
            }
            startIndex = endIndex - overlap;
            if (startIndex >= endIndex)
                break;
        }
        const logger = (0, lambda_logger_1.createLambdaLogger)({ operation: 'TextProcessor.chunkText' });
        logger.info('Text chunking completed', { chunkCount: chunks.length });
        return chunks;
    }
}
exports.TextProcessor = TextProcessor;
