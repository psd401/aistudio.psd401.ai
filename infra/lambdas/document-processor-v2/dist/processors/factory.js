"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DocumentProcessorFactory = void 0;
const pdf_processor_1 = require("./pdf-processor");
const office_processor_1 = require("./office-processor");
const text_processor_1 = require("./text-processor");
const file_type_detector_1 = require("../utils/file-type-detector");
const lambda_logger_1 = require("../utils/lambda-logger");
class DocumentProcessorFactory {
    /**
     * Create document processor using enhanced file type detection
     * @param fileType - MIME type from upload
     * @param config - Processing configuration
     * @param buffer - File buffer for magic number detection
     * @param fileName - Original filename for extension detection
     */
    static create(fileType, config, buffer, fileName) {
        const logger = (0, lambda_logger_1.createLambdaLogger)({ operation: 'DocumentProcessorFactory.create' });
        logger.info('Creating processor', { fileType, fileName });
        let detectedType;
        // Use advanced detection if buffer is provided
        if (buffer) {
            const detection = file_type_detector_1.FileTypeDetector.detectFileType(buffer, fileName, fileType);
            detectedType = detection.detectedType;
            logger.info('Enhanced file type detection result', {
                detectedType: detection.detectedType,
                confidence: detection.confidence,
                method: detection.method,
                reason: detection.reason
            });
            // If detection failed, fall back to legacy method
            if (detectedType === 'unknown') {
                logger.warn('Enhanced detection failed, falling back to legacy method');
                detectedType = this.legacyDetection(fileType, fileName);
            }
        }
        else {
            // Fallback to legacy method without buffer
            logger.info('No buffer provided, using legacy detection');
            detectedType = this.legacyDetection(fileType, fileName);
        }
        // Create processor based on detected type
        switch (detectedType) {
            case 'pdf':
                logger.info('Selected PDF processor', { detectedType });
                return new pdf_processor_1.PDFProcessor(config);
            case 'xlsx':
                logger.info('Selected XLSX processor', { detectedType });
                return new office_processor_1.OfficeProcessor('xlsx', config);
            case 'docx':
                logger.info('Selected DOCX processor', { detectedType });
                return new office_processor_1.OfficeProcessor('docx', config);
            case 'pptx':
                logger.info('Selected PPTX processor', { detectedType });
                return new office_processor_1.OfficeProcessor('pptx', config);
            case 'txt':
            case 'csv':
            case 'md':
                logger.info(`Selected text processor`, { detectedType });
                return new text_processor_1.TextProcessor(config);
            default:
                logger.error('No processor found for detected type', { detectedType, originalFileType: fileType });
                throw new Error(`Unsupported file type: ${fileType} (detected as: ${detectedType})`);
        }
    }
    /**
     * Legacy detection method for backward compatibility
     */
    static legacyDetection(fileType, fileName) {
        const logger = (0, lambda_logger_1.createLambdaLogger)({ operation: 'DocumentProcessorFactory.legacyDetection' });
        const normalizedType = fileType.toLowerCase();
        const normalizedFileName = fileName?.toLowerCase() || '';
        logger.debug('Legacy detection starting', { fileType, fileName });
        // Check PDF first
        if (normalizedType.includes('pdf') || normalizedFileName.endsWith('.pdf')) {
            return 'pdf';
        }
        // Check file extensions first (more reliable than MIME type keywords)
        if (fileName) {
            if (normalizedFileName.endsWith('.xlsx') || normalizedFileName.endsWith('.xls')) {
                return 'xlsx';
            }
            if (normalizedFileName.endsWith('.pptx') || normalizedFileName.endsWith('.ppt')) {
                return 'pptx';
            }
            if (normalizedFileName.endsWith('.docx') || normalizedFileName.endsWith('.doc')) {
                return 'docx';
            }
            if (normalizedFileName.endsWith('.txt')) {
                return 'txt';
            }
            if (normalizedFileName.endsWith('.csv')) {
                return 'csv';
            }
            if (normalizedFileName.endsWith('.md') || normalizedFileName.endsWith('.markdown')) {
                return 'md';
            }
        }
        // Fallback to MIME type analysis (but prioritize XLSX and PPTX over DOCX)
        if (normalizedType.includes('sheet') || normalizedType.includes('excel')) {
            return 'xlsx';
        }
        if (normalizedType.includes('presentation') || normalizedType.includes('powerpoint')) {
            return 'pptx';
        }
        if (normalizedType.includes('word') || normalizedType.includes('document')) {
            return 'docx';
        }
        if (normalizedType.includes('text') || normalizedType.includes('plain')) {
            return 'txt';
        }
        if (normalizedType.includes('csv')) {
            return 'csv';
        }
        // If we still can't detect, return unknown
        return 'unknown';
    }
}
exports.DocumentProcessorFactory = DocumentProcessorFactory;
