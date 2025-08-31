import { 
  ProcessingParams, 
  ProcessingResult, 
  DocumentProcessor, 
  ProcessorConfig 
} from './factory';
import * as mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import { marked } from 'marked';

export class OfficeProcessor implements DocumentProcessor {
  constructor(
    private documentType: 'docx' | 'xlsx' | 'pptx',
    private config: ProcessorConfig
  ) {}

  async process(params: ProcessingParams): Promise<ProcessingResult> {
    const startTime = Date.now();
    const { buffer, fileName, onProgress } = params;
    
    console.log(`Processing ${this.documentType.toUpperCase()}: ${fileName} (${buffer.length} bytes)`);
    
    await onProgress?.('parsing_document', 40);
    
    let extractedContent: any;
    
    try {
      switch (this.documentType) {
        case 'docx':
          extractedContent = await this.processDocx(buffer);
          break;
        case 'xlsx':
          extractedContent = await this.processXlsx(buffer);
          break;
        case 'pptx':
          extractedContent = await this.processPptx(buffer);
          break;
        default:
          throw new Error(`Unsupported document type: ${this.documentType}`);
      }
    } catch (error) {
      console.error(`Error processing ${this.documentType}:`, error);
      throw new Error(`Failed to process ${this.documentType}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    
    if (!extractedContent.text) {
      throw new Error(`No text content extracted from ${this.documentType}`);
    }
    
    await onProgress?.('post_processing', 70);
    
    // Build result
    const result: ProcessingResult = {
      text: extractedContent.text,
      metadata: {
        extractionMethod: `office-processor-${this.documentType}`,
        processingTime: Date.now() - startTime,
        originalSize: buffer.length,
        ...extractedContent.metadata,
      }
    };
    
    // Convert to Markdown if requested
    if (this.config.convertToMarkdown) {
      await onProgress?.('converting_markdown', 80);
      result.markdown = await this.convertToMarkdown(extractedContent, this.documentType);
    }
    
    // Generate chunks if requested
    if (this.config.generateEmbeddings) {
      await onProgress?.('chunking_text', 90);
      result.chunks = await this.chunkText(extractedContent.text);
    }
    
    result.metadata.processingTime = Date.now() - startTime;
    
    console.log(`${this.documentType.toUpperCase()} processing completed: ${result.metadata.processingTime}ms`);
    return result;
  }

  private async processDocx(buffer: Buffer): Promise<any> {
    console.log('Processing DOCX document');
    
    // Extract raw text
    const textResult = await mammoth.extractRawText({ buffer });
    
    // Also extract with HTML for better structure understanding
    const htmlResult = await mammoth.convertToHtml({ buffer });
    
    return {
      text: textResult.value,
      html: htmlResult.value,
      metadata: {
        messages: textResult.messages,
        wordCount: textResult.value.split(/\s+/).length,
        characterCount: textResult.value.length,
      }
    };
  }

  private async processXlsx(buffer: Buffer): Promise<any> {
    console.log('Processing XLSX document');
    
    const workbook = XLSX.read(buffer);
    let combinedText = '';
    const sheetData: any[] = [];
    
    workbook.SheetNames.forEach((sheetName: string, index: number) => {
      const sheet = workbook.Sheets[sheetName];
      
      // Convert to CSV for text extraction
      const csv = XLSX.utils.sheet_to_csv(sheet);
      
      // Convert to JSON for structured data
      const json = XLSX.utils.sheet_to_json(sheet, { header: 1 });
      
      combinedText += `\n\n## Sheet: ${sheetName}\n${csv}`;
      
      sheetData.push({
        name: sheetName,
        index,
        csv,
        json,
        rowCount: json.length,
        columnCount: json.length > 0 ? Math.max(...json.map((row: any) => Array.isArray(row) ? row.length : 0)) : 0,
      });
    });
    
    return {
      text: combinedText.trim(),
      sheets: sheetData,
      metadata: {
        sheetCount: workbook.SheetNames.length,
        sheetNames: workbook.SheetNames,
        totalRows: sheetData.reduce((sum, sheet) => sum + sheet.rowCount, 0),
      }
    };
  }

  private async processPptx(buffer: Buffer): Promise<any> {
    console.log('Processing PPTX document');
    
    // For PPTX, we'll need to use a specialized library or fallback to basic extraction
    // This is a simplified implementation - in production you might use libraries like:
    // - pptx2json
    // - officegen
    // - mammoth (which doesn't support PPTX)
    
    // For now, we'll attempt to extract using a basic approach
    try {
      // Convert buffer to string and look for text patterns
      const content = buffer.toString('utf-8');
      
      // This is a very basic extraction - proper PPTX parsing would require specialized libraries
      const textMatches = content.match(/[A-Za-z0-9\s.,!?;:'"()-]{10,}/g) || [];
      const extractedText = textMatches
        .filter(match => match.trim().length > 10)
        .join('\n')
        .replace(/\s+/g, ' ')
        .trim();
      
      if (!extractedText) {
        throw new Error('No readable text found in PPTX - file might be corrupted or empty');
      }
      
      return {
        text: extractedText,
        metadata: {
          extractionMethod: 'basic-text-extraction',
          warning: 'PPTX processing uses basic text extraction - consider upgrading to specialized library',
          estimatedSlides: Math.max(1, Math.floor(extractedText.length / 500)),
        }
      };
    } catch (error) {
      console.error('PPTX processing failed:', error);
      throw new Error(`Failed to process PPTX: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async convertToMarkdown(extractedContent: any, docType: string): Promise<string> {
    const text = extractedContent.text;
    if (!text) return '';
    
    switch (docType) {
      case 'docx':
        return this.convertDocxToMarkdown(extractedContent);
      case 'xlsx':
        return this.convertXlsxToMarkdown(extractedContent);
      case 'pptx':
        return this.convertPptxToMarkdown(extractedContent);
      default:
        return this.convertTextToMarkdown(text);
    }
  }

  private convertDocxToMarkdown(content: any): string {
    // Use HTML content if available for better structure
    if (content.html) {
      try {
        // Simple HTML to Markdown conversion
        let markdown = content.html
          .replace(/<h([1-6])[^>]*>/g, (match: string, level: string) => '#'.repeat(parseInt(level)) + ' ')
          .replace(/<\/h[1-6]>/g, '\n\n')
          .replace(/<p[^>]*>/g, '')
          .replace(/<\/p>/g, '\n\n')
          .replace(/<strong[^>]*>/g, '**')
          .replace(/<\/strong>/g, '**')
          .replace(/<em[^>]*>/g, '*')
          .replace(/<\/em>/g, '*')
          .replace(/<br[^>]*>/g, '\n')
          .replace(/<[^>]+>/g, '') // Remove remaining HTML tags
          .replace(/\n{3,}/g, '\n\n'); // Clean up excessive newlines
        
        return markdown.trim();
      } catch (error) {
        console.warn('Failed to convert HTML to markdown, falling back to plain text');
      }
    }
    
    // Fallback to plain text conversion
    return this.convertTextToMarkdown(content.text);
  }

  private convertXlsxToMarkdown(content: any): string {
    let markdown = '# Spreadsheet Data\n\n';
    
    if (content.sheets) {
      content.sheets.forEach((sheet: any) => {
        markdown += `## ${sheet.name}\n\n`;
        
        if (sheet.json && sheet.json.length > 0) {
          // Convert JSON to markdown table
          const rows = sheet.json as any[][];
          if (rows.length > 0) {
            // Header row
            const headers = rows[0];
            markdown += '| ' + headers.join(' | ') + ' |\n';
            markdown += '| ' + headers.map(() => '---').join(' | ') + ' |\n';
            
            // Data rows (limit to first 50 rows to prevent huge markdown)
            const dataRows = rows.slice(1, 51);
            dataRows.forEach((row: any[]) => {
              markdown += '| ' + row.join(' | ') + ' |\n';
            });
            
            if (rows.length > 51) {
              markdown += `\n*... and ${rows.length - 51} more rows*\n\n`;
            }
          }
        }
        
        markdown += `\n**Sheet Stats:** ${sheet.rowCount} rows, ${sheet.columnCount} columns\n\n`;
      });
    }
    
    return markdown;
  }

  private convertPptxToMarkdown(content: any): string {
    const text = content.text;
    
    // Basic slide-like structure
    const slides = text.split(/\n{2,}/).filter((slide: string) => slide.trim().length > 0);
    
    let markdown = '# Presentation Content\n\n';
    
    slides.forEach((slide: string, index: number) => {
      markdown += `## Slide ${index + 1}\n\n${slide.trim()}\n\n`;
    });
    
    return markdown;
  }

  private convertTextToMarkdown(text: string): string {
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
    
    return markdown.trim();
  }

  private async chunkText(text: string): Promise<any[]> {
    const chunkSize = 2000;
    const overlap = 200;
    
    const chunks = [];
    let startIndex = 0;
    let chunkIndex = 0;
    
    while (startIndex < text.length) {
      let endIndex = Math.min(startIndex + chunkSize, text.length);
      
      // Try to break at sentence boundary
      if (endIndex < text.length) {
        const lastSentenceEnd = text.lastIndexOf('.', endIndex);
        if (lastSentenceEnd > startIndex) {
          endIndex = lastSentenceEnd + 1;
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
            documentType: this.documentType,
          },
        });
        chunkIndex++;
      }
      
      startIndex = endIndex - overlap;
      if (startIndex >= endIndex) break;
    }
    
    console.log(`Created ${chunks.length} chunks from ${this.documentType} text`);
    return chunks;
  }
}