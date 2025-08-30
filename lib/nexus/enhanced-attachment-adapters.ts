import {
  AttachmentAdapter,
  PendingAttachment,
  CompleteAttachment,
  CompositeAttachmentAdapter,
  SimpleImageAttachmentAdapter,
  SimpleTextAttachmentAdapter,
} from "@assistant-ui/react";
import { extractTextFromDocument } from "@/lib/document-processing";
import { createLogger } from "@/lib/logger";

const log = createLogger({ service: 'enhanced-attachment-adapters' });

/**
 * Hybrid Document Adapter that intelligently routes between
 * client-side and server-side processing based on file size
 */
export class HybridDocumentAdapter implements AttachmentAdapter {
  accept = "application/pdf,.docx,.xlsx,.pptx,.doc,.xls,.ppt";
  private serverProcessingThreshold = 10 * 1024 * 1024; // 10MB

  async add({ file }: { file: File }): Promise<PendingAttachment> {
    // Validate file size (500MB max for server processing)
    const maxSize = 500 * 1024 * 1024;
    if (file.size > maxSize) {
      throw new Error(`File size exceeds 500MB limit`);
    }

    // Validate file type using magic bytes
    const isValid = await this.validateFileType(file);
    if (!isValid) {
      throw new Error(`Invalid file format`);
    }

    return {
      id: crypto.randomUUID(),
      type: "document",
      name: this.sanitizeFileName(file.name),
      contentType: file.type,
      file,
      status: { 
        type: "running",
        reason: "preparing",
        progress: 0
      },
    };
  }

  async send(attachment: PendingAttachment): Promise<CompleteAttachment> {
    const file = attachment.file;
    
    if (file.size <= this.serverProcessingThreshold) {
      // Small file: Process client-side for immediate response
      return this.processClientSide(attachment);
    } else {
      // Large file: Use server processing with polling
      return this.processServerSide(attachment);
    }
  }

  private async processClientSide(attachment: PendingAttachment): Promise<CompleteAttachment> {
    try {
      log.info('Processing document client-side', { 
        fileName: attachment.name, 
        fileSize: attachment.file.size 
      });

      // Convert file to buffer for processing
      const buffer = Buffer.from(await attachment.file.arrayBuffer());
      
      // Get file type from extension
      const fileType = this.getFileTypeFromName(attachment.name);
      
      // Extract text using existing document processing library
      const extracted = await extractTextFromDocument(buffer, fileType);
      
      // Return in assistant-ui format
      return {
        id: attachment.id,
        type: "document",
        name: attachment.name,
        contentType: attachment.contentType,
        file: attachment.file,
        content: [
          {
            type: "text",
            text: `## Document: ${attachment.name}

${extracted.text}

---
*Document processed client-side*
**Pages:** ${extracted.metadata?.pageCount || 'N/A'}
**Size:** ${Math.round(attachment.file.size / 1024)}KB`
          }
        ],
        status: { type: "complete" },
      };
    } catch (error) {
      log.error('Client-side processing failed', { error, fileName: attachment.name });
      
      // Fallback: Return file reference
      return {
        id: attachment.id,
        type: "document",
        name: attachment.name,
        contentType: attachment.contentType,
        file: attachment.file,
        content: [
          {
            type: "text",
            text: `## Document: ${attachment.name}

*Unable to extract content from this document. The file has been attached for reference.*

**Error:** ${error instanceof Error ? error.message : 'Unknown processing error'}
**Size:** ${Math.round(attachment.file.size / 1024)}KB
**Type:** ${attachment.contentType}

*Please try uploading a different format or contact support if this issue persists.*`
          }
        ],
        status: { 
          type: "incomplete",
          reason: "processing_failed",
          error: error instanceof Error ? error : new Error(String(error))
        },
      };
    }
  }

  private async processServerSide(attachment: PendingAttachment): Promise<CompleteAttachment> {
    try {
      log.info('Processing document server-side', { 
        fileName: attachment.name, 
        fileSize: attachment.file.size 
      });

      // Step 1: Initiate server upload
      const uploadSession = await this.initiateUpload(attachment);
      
      // Step 2: Upload to S3 using presigned URL
      await this.uploadToS3(attachment.file, uploadSession);
      
      // Step 3: Confirm upload completion
      await this.confirmUpload(uploadSession);
      
      // Step 4: Poll for processing results
      const processedContent = await this.pollForResults(uploadSession.jobId, attachment.name);
      
      // Step 5: Return in assistant-ui format
      return {
        id: attachment.id,
        type: "document",
        name: attachment.name,
        contentType: attachment.contentType,
        file: attachment.file,
        content: processedContent,
        status: { type: "complete" },
      };
    } catch (error) {
      log.error('Server-side processing failed', { error, fileName: attachment.name });
      
      return {
        id: attachment.id,
        type: "document",
        name: attachment.name,
        contentType: attachment.contentType,
        file: attachment.file,
        content: [{
          type: "text",
          text: `## Document: ${attachment.name}

*Server processing failed. The document could not be processed.*

**Error:** ${error instanceof Error ? error.message : 'Unknown server error'}
**Size:** ${Math.round(attachment.file.size / 1024)}KB

*This may be due to:*
- Unsupported document format
- Corrupted file
- Server processing limits
- Network connectivity issues

Please try re-uploading or contact support if the issue persists.`
        }],
        status: { 
          type: "incomplete",
          reason: "server_error",
          error: error instanceof Error ? error : new Error(String(error))
        },
      };
    }
  }

  private async initiateUpload(attachment: PendingAttachment) {
    const response = await fetch('/api/documents/v2/initiate-upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName: attachment.name,
        fileSize: attachment.file.size,
        fileType: attachment.contentType,
        purpose: 'chat',
        processingOptions: {
          extractText: true,
          convertToMarkdown: true,
          extractImages: false, // Disable for chat to reduce processing time
          ocrEnabled: true
        }
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to initiate upload: ${error}`);
    }
    
    return response.json();
  }

  private async uploadToS3(file: File, session: any) {
    if (session.uploadMethod === 'multipart') {
      // Handle multipart upload for very large files
      await this.multipartUpload(file, session);
    } else {
      // Direct upload for medium files
      const response = await fetch(session.uploadUrl, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': file.type
        }
      });
      
      if (!response.ok) {
        throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
      }
    }
  }

  private async multipartUpload(file: File, session: any) {
    const partSize = 5 * 1024 * 1024; // 5MB chunks
    const parts = [];
    
    for (let i = 0; i < session.partUrls.length; i++) {
      const start = i * partSize;
      const end = Math.min(start + partSize, file.size);
      const chunk = file.slice(start, end);
      
      const response = await fetch(session.partUrls[i].uploadUrl, {
        method: 'PUT',
        body: chunk
      });
      
      if (!response.ok) {
        throw new Error(`Part upload failed: ${response.status}`);
      }
      
      parts.push({
        ETag: response.headers.get('ETag')?.replace(/"/g, ''),
        PartNumber: i + 1
      });
    }
    
    // Complete multipart upload
    const completeResponse = await fetch('/api/documents/v2/complete-multipart', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uploadId: session.uploadId,
        jobId: session.jobId,
        parts
      })
    });
    
    if (!completeResponse.ok) {
      throw new Error('Failed to complete multipart upload');
    }
  }

  private async confirmUpload(session: any) {
    const response = await fetch('/api/documents/v2/confirm-upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uploadId: session.uploadId,
        jobId: session.jobId
      })
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to confirm upload: ${error}`);
    }
  }

  private async pollForResults(jobId: string, fileName: string, maxAttempts = 60) {
    let attempts = 0;
    let pollInterval = 1000; // Start with 1 second
    
    while (attempts < maxAttempts) {
      const response = await fetch(`/api/documents/v2/jobs/${jobId}`);
      
      if (!response.ok) {
        throw new Error(`Failed to check job status: ${response.status}`);
      }
      
      const job = await response.json();
      
      if (job.status === 'completed') {
        // Return content in assistant-ui format
        const result = job.result;
        const content = [];
        
        if (result.markdown) {
          content.push({
            type: 'text',
            text: `## Document: ${fileName}

${result.markdown}

---
*Document processed server-side*
**Processing Time:** ${this.formatProcessingTime(job.createdAt, job.completedAt)}
**Method:** ${result.extractionMethod || 'Server processing'}
${result.pageCount ? `**Pages:** ${result.pageCount}` : ''}`
          });
        } else if (result.text) {
          content.push({
            type: 'text',
            text: `## Document: ${fileName}

${result.text}

---
*Document processed server-side*
**Processing Time:** ${this.formatProcessingTime(job.createdAt, job.completedAt)}
**Method:** ${result.extractionMethod || 'Server processing'}
${result.pageCount ? `**Pages:** ${result.pageCount}` : ''}`
          });
        } else {
          content.push({
            type: 'text',
            text: `## Document: ${fileName}

*Document processed but no text content was extracted.*

This might be because:
- The document contains only images
- The document is password protected
- The document format is not fully supported

**Processing Time:** ${this.formatProcessingTime(job.createdAt, job.completedAt)}`
          });
        }
        
        // Add images if extracted
        if (result.images && result.images.length > 0) {
          content.push({
            type: 'text',
            text: `\n**Extracted Images:** ${result.images.length} image(s) found`
          });
        }
        
        return content;
      } else if (job.status === 'failed') {
        throw new Error(job.error || 'Server processing failed');
      } else if (job.status === 'processing') {
        // Show progress if available
        if (job.progress && job.processingStage) {
          log.info('Processing progress', { 
            jobId, 
            progress: job.progress, 
            stage: job.processingStage 
          });
        }
      }
      
      // Wait before next poll with exponential backoff
      await new Promise(resolve => setTimeout(resolve, pollInterval));
      pollInterval = Math.min(pollInterval * 1.2, 5000); // Max 5 seconds
      attempts++;
    }
    
    throw new Error('Processing timeout - document processing took too long');
  }

  private formatProcessingTime(startTime: string, endTime: string): string {
    const start = new Date(startTime).getTime();
    const end = new Date(endTime).getTime();
    const duration = end - start;
    
    if (duration < 1000) return `${duration}ms`;
    if (duration < 60000) return `${Math.round(duration / 1000)}s`;
    return `${Math.round(duration / 60000)}m ${Math.round((duration % 60000) / 1000)}s`;
  }

  private async validateFileType(file: File): Promise<boolean> {
    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer).subarray(0, 8);
      const header = Array.from(bytes)
        .map(byte => byte.toString(16).padStart(2, '0'))
        .join('');
      
      // Check magic bytes for supported formats
      const magicBytes = {
        pdf: '25504446',      // %PDF
        office: '504b0304',   // ZIP-based format (Office 2007+)
        ole: 'd0cf11e0',      // OLE format (Office 97-2003)
      };
      
      // Check PDF
      if (header.startsWith(magicBytes.pdf)) return true;
      
      // Check Office formats
      if (header.startsWith(magicBytes.office) || header.startsWith(magicBytes.ole)) {
        const ext = file.name.split('.').pop()?.toLowerCase();
        return ['docx', 'doc', 'xlsx', 'xls', 'pptx', 'ppt'].includes(ext || '');
      }
      
      return false;
    } catch {
      return false;
    }
  }

  private getFileTypeFromName(fileName: string): string {
    const extension = fileName.split('.').pop()?.toLowerCase() || '';
    
    switch (extension) {
      case 'pdf': return 'pdf';
      case 'docx':
      case 'doc': return 'docx';
      case 'xlsx':
      case 'xls': return 'xlsx';
      case 'pptx':
      case 'ppt': return 'pptx';
      default: return extension;
    }
  }

  private sanitizeFileName(name: string): string {
    // Remove dangerous characters and limit length
    return name.replace(/[^a-zA-Z0-9.-]/g, '_').substring(0, 255);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async remove(_attachment: PendingAttachment): Promise<void> {
    // Cleanup if needed
  }
}

/**
 * Enhanced Vision Image Adapter - extends the basic one with error handling
 */
export class EnhancedVisionImageAdapter extends SimpleImageAttachmentAdapter {
  accept = "image/jpeg,image/png,image/webp,image/gif,image/bmp";

  async add({ file }: { file: File }): Promise<PendingAttachment> {
    // Validate file size (20MB limit for most LLMs)
    const maxSize = 20 * 1024 * 1024;
    if (file.size > maxSize) {
      throw new Error("Image size exceeds 20MB limit");
    }

    // Validate MIME type using magic bytes
    const isValidImage = await this.verifyImageMimeType(file);
    if (!isValidImage) {
      throw new Error("Invalid image file format");
    }

    return super.add({ file });
  }

  private async verifyImageMimeType(file: File): Promise<boolean> {
    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer).subarray(0, 8);
      const header = Array.from(bytes)
        .map(byte => byte.toString(16).padStart(2, '0'))
        .join('');
      
      // Check magic bytes for common image formats
      const imageHeaders = {
        '89504e47': 'image/png',     // PNG
        'ffd8ffe0': 'image/jpeg',    // JPEG (JFIF)
        'ffd8ffe1': 'image/jpeg',    // JPEG (Exif)
        'ffd8ffe2': 'image/jpeg',    // JPEG (Canon)
        '47494638': 'image/gif',     // GIF
        '52494646': 'image/webp',    // RIFF (WebP container)
        '424d': 'image/bmp',         // BMP (first 2 bytes)
      };
      
      return Object.keys(imageHeaders).some(h => 
        header.startsWith(h.toLowerCase())
      );
    } catch {
      return false;
    }
  }
}

/**
 * Creates a composite adapter combining all enhanced attachment adapters for Nexus
 * Includes:
 * - Enhanced vision-capable image adapter
 * - Hybrid document adapter (client/server processing)
 * - Simple text adapter
 */
export function createEnhancedNexusAttachmentAdapter() {
  return new CompositeAttachmentAdapter([
    new EnhancedVisionImageAdapter(),   // Enhanced image processing with validation
    new HybridDocumentAdapter(),        // Smart document processing (client/server)
    new SimpleTextAttachmentAdapter(),  // Text files
  ]);
}