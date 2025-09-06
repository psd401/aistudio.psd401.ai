"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processWithTextract = processWithTextract;
exports.isTextractConfigured = isTextractConfigured;
const client_textract_1 = require("@aws-sdk/client-textract");
const lambda_logger_1 = require("../utils/lambda-logger");
const textractClient = new client_textract_1.TextractClient({});
/**
 * Process PDF document synchronously with Textract OCR
 */
async function processWithTextract(request) {
    const startTime = Date.now();
    const log = (0, lambda_logger_1.createLambdaLogger)({
        operation: 'processWithTextract',
        fileName: request.fileName
    });
    try {
        log.info('Starting synchronous Textract processing', {
            fileName: request.fileName,
            fileSize: request.fileBuffer.length,
            useAnalysis: request.options?.useAnalysis
        });
        // Prepare document for Textract
        const document = {
            Bytes: request.fileBuffer,
        };
        let textractResponse;
        if (request.options?.useAnalysis) {
            // Use document analysis for more detailed extraction (tables, forms, etc.)
            textractResponse = await textractClient.send(new client_textract_1.AnalyzeDocumentCommand({
                Document: document,
                FeatureTypes: ['TABLES', 'FORMS', 'LAYOUT'],
            }));
        }
        else {
            // Use simple text detection for basic OCR
            textractResponse = await textractClient.send(new client_textract_1.DetectDocumentTextCommand({
                Document: document,
            }));
        }
        // Extract text from Textract blocks
        const extractedText = extractTextFromBlocks(textractResponse.Blocks || []);
        const processingTime = Date.now() - startTime;
        if (!extractedText || extractedText.trim().length === 0) {
            throw new Error('No text could be extracted from PDF using Textract OCR');
        }
        log.info('Textract processing completed successfully', {
            fileName: request.fileName,
            extractedTextLength: extractedText.length,
            processingTime,
            blockCount: textractResponse.Blocks?.length || 0
        });
        return {
            text: extractedText,
            metadata: {
                extractionMethod: request.options?.useAnalysis ? 'textract-analysis' : 'textract-detect',
                processingTime,
                pageCount: countPages(textractResponse.Blocks || []),
            },
        };
    }
    catch (error) {
        const processingTime = Date.now() - startTime;
        log.error('Textract processing failed', error, {
            fileName: request.fileName,
            processingTime
        });
        throw new Error(`Textract OCR failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}
/**
 * Extract text from Textract blocks
 */
function extractTextFromBlocks(blocks) {
    const lines = [];
    // Sort blocks by geometry to maintain reading order
    const lineBlocks = blocks
        .filter(block => block.BlockType === 'LINE' && block.Text)
        .sort((a, b) => {
        // Sort by top position first, then left position
        const aTop = a.Geometry?.BoundingBox?.Top || 0;
        const bTop = b.Geometry?.BoundingBox?.Top || 0;
        const aLeft = a.Geometry?.BoundingBox?.Left || 0;
        const bLeft = b.Geometry?.BoundingBox?.Left || 0;
        if (Math.abs(aTop - bTop) < 0.01) { // Same line
            return aLeft - bLeft;
        }
        return aTop - bTop;
    });
    for (const block of lineBlocks) {
        if (block.Text) {
            lines.push(block.Text);
        }
    }
    return lines.join('\n');
}
/**
 * Count pages from Textract blocks
 */
function countPages(blocks) {
    const pageBlocks = blocks.filter(block => block.BlockType === 'PAGE');
    return Math.max(1, pageBlocks.length);
}
/**
 * Check if Textract is available (always true for synchronous processing)
 */
function isTextractConfigured() {
    return true; // Synchronous Textract doesn't need additional setup
}
