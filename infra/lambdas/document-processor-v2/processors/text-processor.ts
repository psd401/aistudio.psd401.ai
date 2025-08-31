import { 
  ProcessingParams, 
  ProcessingResult, 
  DocumentProcessor, 
  ProcessorConfig 
} from './factory';
import { parse as csvParse } from 'csv-parse/sync';
import { marked } from 'marked';

export class TextProcessor implements DocumentProcessor {
  constructor(private config: ProcessorConfig) {}

  async process(params: ProcessingParams): Promise<ProcessingResult> {
    const startTime = Date.now();
    const { buffer, fileName, fileType, onProgress } = params;
    
    console.log(`Processing text document: ${fileName} (${buffer.length} bytes)`);
    
    await onProgress?.('parsing_text', 40);
    
    const textContent = buffer.toString('utf-8');
    let extractedContent: any;
    
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
    } catch (error) {
      console.error(`Error processing text document:`, error);
      throw new Error(`Failed to process text: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    
    if (!extractedContent.text) {
      throw new Error('No text content extracted from document');
    }
    
    await onProgress?.('post_processing', 70);
    
    // Build result
    const result: ProcessingResult = {
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
    } else if (extractedContent.markdown) {
      result.markdown = extractedContent.markdown;
    }
    
    // Generate chunks if requested
    if (this.config.generateEmbeddings) {
      await onProgress?.('chunking_text', 90);
      result.chunks = await this.chunkText(extractedContent.text);
    }
    
    result.metadata.processingTime = Date.now() - startTime;
    
    console.log(`Text processing completed: ${result.metadata.processingTime}ms`);
    return result;
  }

  private async processCsv(content: string): Promise<any> {
    console.log('Processing CSV content');
    
    try {
      const records = csvParse(content, {
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
        sampleRecords.forEach((record: any, index: number) => {
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
    } catch (error) {
      console.warn('Failed to parse as CSV, treating as plain text');
      return this.processPlainText(content);
    }
  }

  private async processMarkdown(content: string): Promise<any> {
    console.log('Processing Markdown content');
    
    try {
      // Convert markdown to plain text for text field
      const html = await marked.parse(content);
      const plainText = html.replace(/<[^>]*>/g, '').trim();
      
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
    } catch (error) {
      console.warn('Failed to parse markdown, treating as plain text');
      return this.processPlainText(content);
    }
  }

  private async processJson(content: string): Promise<any> {
    console.log('Processing JSON content');
    
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
    } catch (error) {
      console.warn('Failed to parse as JSON, treating as plain text');
      return this.processPlainText(content);
    }
  }

  private async processXml(content: string): Promise<any> {
    console.log('Processing XML content');
    
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

  private async processPlainText(content: string): Promise<any> {
    console.log('Processing plain text content');
    
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

  private jsonToText(data: any, indent: number = 0): string {
    const spaces = '  '.repeat(indent);
    
    if (Array.isArray(data)) {
      if (data.length === 0) return 'Empty array';
      
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
      if (keys.length === 0) return 'Empty object';
      
      let result = '';
      keys.slice(0, 10).forEach(key => {
        const value = data[key];
        if (typeof value === 'object') {
          result += `${spaces}${key}: ${this.jsonToText(value, indent + 1)}\n`;
        } else {
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

  private async convertToMarkdown(extractedContent: any): Promise<string> {
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

  private csvToMarkdown(content: any): string {
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
    
    displayRecords.forEach((record: any) => {
      const row = headers.map(header => String(record[header] || '').replace(/\|/g, '\\|'));
      markdown += '| ' + row.join(' | ') + ' |\n';
    });
    
    if (records.length > 20) {
      markdown += `\n*... and ${records.length - 20} more records*\n`;
    }
    
    return markdown;
  }

  private jsonToMarkdown(content: any): string {
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
      } else {
        markdown += '**Object Data**\n\n';
        markdown += '```json\n';
        markdown += JSON.stringify(data, null, 2);
        markdown += '\n```\n';
      }
    }
    
    return markdown;
  }

  private xmlToMarkdown(content: any): string {
    return `# XML Document\n\n${content.text}`;
  }

  private textToMarkdown(text: string): string {
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

  private async chunkText(text: string): Promise<any[]> {
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
      if (startIndex >= endIndex) break;
    }
    
    console.log(`Created ${chunks.length} chunks from text document`);
    return chunks;
  }
}