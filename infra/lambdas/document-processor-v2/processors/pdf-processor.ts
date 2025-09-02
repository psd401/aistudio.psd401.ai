import { 
  ProcessingParams, 
  ProcessingResult, 
  DocumentProcessor, 
  ProcessorConfig 
} from './factory';
import pdfParse from 'pdf-parse';
import { createLambdaLogger } from '../utils/lambda-logger';

export class PDFProcessor implements DocumentProcessor {
  constructor(private config: ProcessorConfig) {}

  async process(params: ProcessingParams): Promise<ProcessingResult> {
    const startTime = Date.now();
    const { buffer, fileName, onProgress } = params;
    const logger = createLambdaLogger({ 
      operation: 'PDFProcessor.process',
      fileName,
      fileSize: buffer.length
    });
    
    logger.info('Starting PDF processing', { fileName, bufferSize: buffer.length });
    
    await onProgress?.('parsing_pdf', 40);
    
    try {
      // Use the exact same logic as the working file-processor
      const extractionResult = await this.extractTextFromPDF(buffer);
      
      if (!extractionResult.text || extractionResult.text.trim().length === 0) {
        throw new Error('No text content extracted from PDF - may need OCR');
      }
      
      await onProgress?.('post_processing', 70);
      
      // Build result
      const result: ProcessingResult = {
        text: extractionResult.text,
        metadata: {
          extractionMethod: 'pdf-parse',
          processingTime: Date.now() - startTime,
          pageCount: extractionResult.pageCount || 1,
          originalSize: buffer.length,
        }
      };
      
      // Convert to Markdown if requested
      if (this.config.convertToMarkdown) {
        await onProgress?.('converting_markdown', 80);
        result.markdown = this.convertToMarkdown(extractionResult.text);
      }
      
      // Generate chunks if requested
      if (this.config.generateEmbeddings) {
        await onProgress?.('chunking_text', 90);
        result.chunks = this.chunkText(extractionResult.text);
      }
      
      result.metadata.processingTime = Date.now() - startTime;
      
      logger.info('PDF processing completed successfully', {
        processingTime: result.metadata.processingTime,
        textLength: result.text?.length || 0,
        hasMarkdown: !!result.markdown,
        chunkCount: result.chunks?.length || 0
      });
      return result;
      
    } catch (error) {
      logger.error('Error extracting text from PDF with pdf-parse', error);
      throw new Error('Failed to extract text from PDF');
    }
  }

  // Copy the exact working PDF extraction logic from file-processor
  private async extractTextFromPDF(buffer: Buffer): Promise<{ text: string | null; pageCount: number }> {
    const logger = createLambdaLogger({ operation: 'PDFProcessor.extractTextFromPDF' });
    
    try {
      logger.debug('Attempting to parse PDF', { bufferSize: buffer.length });
      
      // Try parsing the PDF
      const data = await pdfParse(buffer);
      logger.info('PDF parsed successfully', {
        textLength: data.text?.length || 0,
        pageCount: data.numpages,
        version: data.version
      });
      
      const pageCount = data.numpages || 1;
      
      // If no text extracted, it might be a scanned PDF
      if (!data.text || data.text.trim().length === 0) {
        logger.warn('No text found in PDF - might be scanned image PDF', { pageCount });
        // Return null to indicate OCR is needed
        return { text: null, pageCount };
      }
      
      // Also check if extracted text is suspiciously short for the number of pages
      const avgCharsPerPage = data.text.length / pageCount;
      if (avgCharsPerPage < 100 && pageCount > 1) {
        logger.warn('Suspiciously low text content detected', {
          avgCharsPerPage,
          pageCount,
          totalChars: data.text.length
        });
        return { text: null, pageCount };
      }
      
      return { text: data.text, pageCount };
    } catch (error) {
      logger.error('PDF parsing error', error);
      // Try a more basic extraction as fallback
      try {
        const basicData = await pdfParse(buffer);
        if (basicData.text) {
          logger.info('Basic extraction succeeded as fallback');
          return { text: basicData.text, pageCount: basicData.numpages || 1 };
        }
      } catch (fallbackError) {
        logger.error('Fallback PDF parsing also failed', fallbackError);
      }
      // Return null text to trigger OCR
      logger.error('Failed to parse PDF - returning null to trigger OCR', error);
      return { text: null, pageCount: 1 };
    }
  }


  private convertToMarkdown(text: string): string {
    if (!text) return '';
    
    // Simple markdown conversion (same logic as main app)
    // Split into paragraphs
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
    
    return markdown.trim();
  }


  // Copy the exact chunking logic from file-processor
  private chunkText(text: string): any[] {
    const maxChunkSize = 2000; // Same as file-processor
    const chunks: any[] = [];
    const lines = text.split('\n');
    let currentChunk = '';
    let chunkIndex = 0;
    
    for (const line of lines) {
      if ((currentChunk + line).length > maxChunkSize && currentChunk.length > 0) {
        chunks.push({
          chunkIndex: chunkIndex++,
          content: currentChunk.trim(),
          metadata: { 
            lineStart: chunkIndex,
            length: currentChunk.trim().length,
          },
          tokens: Math.ceil(currentChunk.length / 4), // Rough token estimate
        });
        currentChunk = line + '\n';
      } else {
        currentChunk += line + '\n';
      }
    }
    
    if (currentChunk.trim().length > 0) {
      chunks.push({
        chunkIndex: chunkIndex++,
        content: currentChunk.trim(),
        metadata: { 
          lineStart: chunkIndex,
          length: currentChunk.trim().length,
        },
        tokens: Math.ceil(currentChunk.length / 4),
      });
    }
    
    const logger = createLambdaLogger({ operation: 'PDFProcessor.chunkText' });
    logger.info('Text chunking completed', { chunkCount: chunks.length });
    return chunks;
  }

}