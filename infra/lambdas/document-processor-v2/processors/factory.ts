import { PDFProcessor } from './pdf-processor';
import { OfficeProcessor } from './office-processor';
import { TextProcessor } from './text-processor';

export interface ProcessorConfig {
  enableOCR: boolean;
  convertToMarkdown: boolean;
  extractImages: boolean;
  generateEmbeddings: boolean;
}

export interface ProcessingParams {
  buffer: Buffer;
  fileName: string;
  fileType: string;
  jobId: string;
  options: {
    extractText: boolean;
    convertToMarkdown: boolean;
    extractImages: boolean;
    generateEmbeddings: boolean;
    ocrEnabled: boolean;
  };
  onProgress?: (stage: string, progress: number) => Promise<void>;
}

export interface ProcessingResult {
  text?: string;
  markdown?: string;
  chunks?: Array<{
    chunkIndex: number;
    content: string;
    embedding?: number[];
    metadata?: any;
  }>;
  images?: Array<{
    imageIndex: number;
    s3Key: string;
    caption?: string;
    metadata?: any;
  }>;
  metadata: {
    extractionMethod: string;
    processingTime: number;
    pageCount?: number;
    confidence?: number;
    [key: string]: any;
  };
}

export interface DocumentProcessor {
  process(params: ProcessingParams): Promise<ProcessingResult>;
}

export class DocumentProcessorFactory {
  static create(fileType: string, config: ProcessorConfig): DocumentProcessor {
    const normalizedType = fileType.toLowerCase();
    
    if (normalizedType.includes('pdf')) {
      return new PDFProcessor(config);
    } else if (
      normalizedType.includes('word') || 
      normalizedType.includes('document') ||
      normalizedType.endsWith('docx') ||
      normalizedType.endsWith('doc')
    ) {
      return new OfficeProcessor('docx', config);
    } else if (
      normalizedType.includes('sheet') || 
      normalizedType.includes('excel') ||
      normalizedType.endsWith('xlsx') ||
      normalizedType.endsWith('xls')
    ) {
      return new OfficeProcessor('xlsx', config);
    } else if (
      normalizedType.includes('presentation') || 
      normalizedType.includes('powerpoint') ||
      normalizedType.endsWith('pptx') ||
      normalizedType.endsWith('ppt')
    ) {
      return new OfficeProcessor('pptx', config);
    } else if (
      normalizedType.includes('text') || 
      normalizedType.includes('plain') ||
      normalizedType.endsWith('txt') ||
      normalizedType.endsWith('md') ||
      normalizedType.endsWith('csv')
    ) {
      return new TextProcessor(config);
    } else {
      throw new Error(`Unsupported file type: ${fileType}`);
    }
  }
}