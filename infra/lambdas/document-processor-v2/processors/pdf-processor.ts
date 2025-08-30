import { 
  ProcessingParams, 
  ProcessingResult, 
  DocumentProcessor, 
  ProcessorConfig 
} from './factory';
import { TextractClient, StartDocumentTextDetectionCommand, GetDocumentTextDetectionCommand } from '@aws-sdk/client-textract';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import pdfParse from 'pdf-parse';
import { marked } from 'marked';

const textractClient = new TextractClient({});
const s3Client = new S3Client({});

export class PDFProcessor implements DocumentProcessor {
  constructor(private config: ProcessorConfig) {}

  async process(params: ProcessingParams): Promise<ProcessingResult> {
    const startTime = Date.now();
    const { buffer, fileName, jobId, onProgress } = params;
    
    console.log(`Processing PDF: ${fileName} (${buffer.length} bytes)`);
    
    await onProgress?.('parsing_pdf', 40);
    
    // Try multiple extraction strategies in order of preference
    const strategies = [
      { 
        name: 'pdf-parse', 
        handler: this.extractWithPdfParse.bind(this),
        condition: () => true // Always try first
      },
      { 
        name: 'textract', 
        handler: this.extractWithTextract.bind(this),
        condition: () => this.config.enableOCR // Only if OCR is enabled
      },
    ];
    
    let extractedContent: any = null;
    let successfulStrategy = null;
    
    for (const strategy of strategies) {
      if (!strategy.condition()) continue;
      
      try {
        console.log(`Attempting extraction with ${strategy.name}`);
        await onProgress?.(`extracting_${strategy.name}`, 50);
        
        extractedContent = await strategy.handler(buffer, fileName, jobId);
        
        if (extractedContent && extractedContent.text) {
          successfulStrategy = strategy.name;
          console.log(`Successfully extracted with ${strategy.name}: ${extractedContent.text.length} characters`);
          break;
        }
      } catch (error) {
        console.warn(`${strategy.name} failed:`, error instanceof Error ? error.message : error);
      }
    }
    
    if (!extractedContent || !extractedContent.text) {
      throw new Error('All extraction strategies failed');
    }
    
    await onProgress?.('post_processing', 70);
    
    // Build result
    const result: ProcessingResult = {
      text: extractedContent.text,
      metadata: {
        extractionMethod: successfulStrategy!,
        processingTime: Date.now() - startTime,
        pageCount: extractedContent.pageCount || 1,
        confidence: extractedContent.confidence,
        originalSize: buffer.length,
        ...extractedContent.metadata,
      }
    };
    
    // Convert to Markdown if requested
    if (this.config.convertToMarkdown && extractedContent.text) {
      await onProgress?.('converting_markdown', 80);
      result.markdown = await this.convertToMarkdown(extractedContent);
    }
    
    // Extract and store images if requested
    if (this.config.extractImages && extractedContent.images) {
      await onProgress?.('extracting_images', 85);
      result.images = await this.processImages(extractedContent.images, jobId);
    }
    
    // Generate chunks if requested
    if (this.config.generateEmbeddings) {
      await onProgress?.('chunking_text', 90);
      result.chunks = await this.chunkText(extractedContent.text);
    }
    
    result.metadata.processingTime = Date.now() - startTime;
    
    console.log(`PDF processing completed: ${result.metadata.processingTime}ms`);
    return result;
  }

  private async extractWithPdfParse(buffer: Buffer, fileName: string, jobId: string): Promise<any> {
    console.log(`Parsing PDF with pdf-parse: ${fileName}`);
    
    const data = await pdfParse(buffer, {
      max: 0, // Parse all pages
      version: 'v2.0.550',
    });
    
    const pageCount = data.numpages || 1;
    
    // Check if extracted text is sufficient
    if (!data.text || data.text.trim().length === 0) {
      console.warn('No text found in PDF - might be a scanned document');
      return { text: null, pageCount };
    }
    
    // Check text density (suspicious if too little text for many pages)
    const avgCharsPerPage = data.text.length / pageCount;
    if (avgCharsPerPage < 100 && pageCount > 1) {
      console.warn(`Low text density: ${avgCharsPerPage} chars/page for ${pageCount} pages`);
      return { text: null, pageCount };
    }
    
    return {
      text: data.text,
      pageCount,
      confidence: 1.0, // pdf-parse doesn't provide confidence
      metadata: {
        info: data.info,
        metadata: data.metadata,
        version: data.version,
      }
    };
  }

  private async extractWithTextract(buffer: Buffer, fileName: string, jobId: string): Promise<any> {
    console.log(`Processing PDF with AWS Textract: ${fileName}`);
    
    // Upload buffer to S3 for Textract processing
    const s3Key = `textract-temp/${jobId}/${fileName}`;
    const bucketName = process.env.DOCUMENTS_BUCKET_NAME!;
    
    await s3Client.send(new PutObjectCommand({
      Bucket: bucketName,
      Key: s3Key,
      Body: buffer,
      ContentType: 'application/pdf',
    }));
    
    console.log(`Uploaded PDF to S3 for Textract: ${s3Key}`);
    
    // Start Textract job
    const startResponse = await textractClient.send(
      new StartDocumentTextDetectionCommand({
        DocumentLocation: {
          S3Object: {
            Bucket: bucketName,
            Name: s3Key,
          },
        },
        ClientRequestToken: `job-${jobId}-${Date.now()}`,
      })
    );
    
    const textractJobId = startResponse.JobId;
    if (!textractJobId) {
      throw new Error('Failed to start Textract job');
    }
    
    console.log(`Started Textract job: ${textractJobId}`);
    
    // Poll for completion
    let attempts = 0;
    const maxAttempts = 120; // 10 minutes with 5-second intervals
    
    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
      
      const getResponse = await textractClient.send(
        new GetDocumentTextDetectionCommand({ JobId: textractJobId })
      );
      
      console.log(`Textract job status: ${getResponse.JobStatus}`);
      
      if (getResponse.JobStatus === 'SUCCEEDED') {
        return this.processTextractResults(getResponse);
      } else if (getResponse.JobStatus === 'FAILED') {
        throw new Error(`Textract job failed: ${getResponse.StatusMessage}`);
      }
      
      attempts++;
    }
    
    throw new Error('Textract job timeout after 10 minutes');
  }

  private processTextractResults(response: any): any {
    const blocks = response.Blocks || [];
    let text = '';
    let totalConfidence = 0;
    let confidenceCount = 0;
    
    // Extract text from LINE blocks (maintains reading order)
    const lines = blocks
      .filter((block: any) => block.BlockType === 'LINE')
      .sort((a: any, b: any) => {
        // Sort by Y position first, then X position
        const aY = a.Geometry?.BoundingBox?.Top || 0;
        const bY = b.Geometry?.BoundingBox?.Top || 0;
        if (Math.abs(aY - bY) > 0.01) { // Different lines
          return aY - bY;
        }
        // Same line, sort by X position
        const aX = a.Geometry?.BoundingBox?.Left || 0;
        const bX = b.Geometry?.BoundingBox?.Left || 0;
        return aX - bX;
      });
    
    for (const line of lines) {
      if (line.Text) {
        text += line.Text + '\n';
        
        if (line.Confidence) {
          totalConfidence += line.Confidence;
          confidenceCount++;
        }
      }
    }
    
    const avgConfidence = confidenceCount > 0 ? totalConfidence / confidenceCount : 0;
    
    console.log(`Textract extracted ${text.length} characters with ${avgConfidence.toFixed(2)}% confidence`);
    
    return {
      text: text.trim(),
      confidence: avgConfidence / 100, // Convert to 0-1 scale
      metadata: {
        blockCount: blocks.length,
        lineCount: lines.length,
        textractJobId: response.JobId,
      }
    };
  }

  private async convertToMarkdown(extractedContent: any): Promise<string> {
    const text = extractedContent.text;
    if (!text) return '';
    
    // Simple markdown conversion
    // Split into paragraphs
    const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
    
    let markdown = '';
    
    for (const paragraph of paragraphs) {
      const trimmed = paragraph.trim();
      
      // Detect headers (lines that are short and don't end with punctuation)
      if (trimmed.length < 100 && !/[.!?]$/.test(trimmed) && /^[A-Z]/.test(trimmed)) {
        // Check if it looks like a header
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

  private async processImages(images: any[], jobId: string): Promise<any[]> {
    // Process and store extracted images
    const processedImages = [];
    
    for (let i = 0; i < images.length; i++) {
      const image = images[i];
      const imageKey = `extracted-images/${jobId}/image-${i}.png`;
      
      // Store image in S3 (if image data is provided)
      if (image.data) {
        await s3Client.send(new PutObjectCommand({
          Bucket: process.env.DOCUMENTS_BUCKET_NAME!,
          Key: imageKey,
          Body: Buffer.from(image.data, 'base64'),
          ContentType: 'image/png',
        }));
      }
      
      processedImages.push({
        imageIndex: i,
        s3Key: imageKey,
        caption: image.caption || `Image ${i + 1}`,
        metadata: {
          width: image.width,
          height: image.height,
          format: image.format || 'png',
        },
      });
    }
    
    return processedImages;
  }

  private async chunkText(text: string): Promise<any[]> {
    const chunkSize = 2000; // Characters per chunk
    const overlap = 200; // Overlap between chunks
    
    const chunks = [];
    let startIndex = 0;
    let chunkIndex = 0;
    
    while (startIndex < text.length) {
      let endIndex = Math.min(startIndex + chunkSize, text.length);
      
      // Try to break at sentence boundary if not at end
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
          },
        });
        chunkIndex++;
      }
      
      startIndex = endIndex - overlap; // Move start back by overlap amount
      if (startIndex >= endIndex) break; // Prevent infinite loop
    }
    
    console.log(`Created ${chunks.length} chunks from PDF text`);
    return chunks;
  }
}