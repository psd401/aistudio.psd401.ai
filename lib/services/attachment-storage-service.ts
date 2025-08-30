import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { createLogger } from '@/lib/logger';

const s3Client = new S3Client({});
const log = createLogger({ service: 'attachment-storage' });

const DOCUMENTS_BUCKET = process.env.DOCUMENTS_BUCKET_NAME || 'aistudio-documents-dev';

export interface AttachmentMetadata {
  s3Key: string;
  originalName: string;
  contentType: string;
  size: number;
  attachmentId: string;
}

export interface StoredAttachment {
  type: 'image' | 'document' | 'file';
  s3Key: string;
  originalContent: any; // Original attachment content part
  metadata: AttachmentMetadata;
}

/**
 * Store attachment content in S3 with conversation-scoped keys
 */
export async function storeAttachmentInS3(
  conversationId: string,
  messageId: string,
  attachment: any,
  attachmentIndex: number
): Promise<AttachmentMetadata> {
  try {
    const attachmentId = attachment.id || crypto.randomUUID();
    const sanitizedName = sanitizeFileName(attachment.name || 'attachment');
    
    // Create conversation-scoped S3 key
    const s3Key = `conversations/${conversationId}/attachments/${messageId}-${attachmentIndex}-${sanitizedName}`;
    
    // Determine content to store based on attachment type
    let contentToStore: any;
    let contentType: string;
    
    if (attachment.type === 'image' && attachment.image) {
      // Store image data (base64)
      contentToStore = {
        type: 'image',
        image: attachment.image,
        name: attachment.name,
        contentType: attachment.contentType
      };
      contentType = 'application/json';
    } else if (attachment.type === 'document' || attachment.type === 'file') {
      // Store document/file data
      contentToStore = {
        type: attachment.type,
        data: attachment.data || attachment.content,
        name: attachment.name,
        contentType: attachment.contentType
      };
      contentType = 'application/json';
    } else {
      throw new Error(`Unsupported attachment type: ${attachment.type}`);
    }
    
    // Store in S3
    await s3Client.send(new PutObjectCommand({
      Bucket: DOCUMENTS_BUCKET,
      Key: s3Key,
      Body: JSON.stringify(contentToStore),
      ContentType: contentType,
      Metadata: {
        conversationId,
        messageId,
        attachmentId,
        originalName: sanitizedName,
        attachmentType: attachment.type,
      },
    }));
    
    log.info('Attachment stored in S3', {
      conversationId,
      messageId,
      attachmentId,
      s3Key,
      size: JSON.stringify(contentToStore).length
    });
    
    return {
      s3Key,
      originalName: attachment.name || 'attachment',
      contentType: attachment.contentType || 'application/octet-stream',
      size: JSON.stringify(contentToStore).length,
      attachmentId
    };
    
  } catch (error) {
    log.error('Failed to store attachment in S3', {
      conversationId,
      messageId,
      error: error instanceof Error ? error.message : String(error)
    });
    throw new Error(`Failed to store attachment: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Retrieve attachment content from S3
 */
export async function getAttachmentFromS3(s3Key: string): Promise<any> {
  try {
    const response = await s3Client.send(new GetObjectCommand({
      Bucket: DOCUMENTS_BUCKET,
      Key: s3Key,
    }));
    
    if (!response.Body) {
      throw new Error('No content returned from S3');
    }
    
    const bodyText = await response.Body.transformToString();
    const attachmentData = JSON.parse(bodyText);
    
    log.info('Attachment retrieved from S3', {
      s3Key,
      type: attachmentData.type,
      size: bodyText.length
    });
    
    return attachmentData;
    
  } catch (error) {
    log.error('Failed to retrieve attachment from S3', {
      s3Key,
      error: error instanceof Error ? error.message : String(error)
    });
    throw new Error(`Failed to retrieve attachment: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Process messages to extract and store attachments in S3
 * Returns lightweight messages with S3 references
 */
export async function processMessagesWithAttachments(
  conversationId: string,
  messages: any[]
): Promise<{ lightweightMessages: any[], attachmentReferences: AttachmentMetadata[] }> {
  const lightweightMessages = [];
  const attachmentReferences: AttachmentMetadata[] = [];
  
  for (let msgIndex = 0; msgIndex < messages.length; msgIndex++) {
    const message = messages[msgIndex];
    const messageId = crypto.randomUUID();
    
    if (Array.isArray(message.content)) {
      const lightweightContent = [];
      let attachmentIndex = 0;
      
      for (const part of message.content) {
        if (part.type === 'image' && part.image) {
          // Store image in S3
          const metadata = await storeAttachmentInS3(
            conversationId,
            messageId,
            part,
            attachmentIndex++
          );
          
          attachmentReferences.push(metadata);
          
          // Replace with S3 reference
          lightweightContent.push({
            type: 'text' as const,
            text: `[Image: ${part.name || 'Uploaded image'} - Stored in conversation context]`
          });
        } else if ((part.type === 'document' || part.type === 'file') && (part.data || part.content)) {
          // Store document in S3
          const metadata = await storeAttachmentInS3(
            conversationId,
            messageId,
            part,
            attachmentIndex++
          );
          
          attachmentReferences.push(metadata);
          
          // Replace with S3 reference
          lightweightContent.push({
            type: 'text' as const,
            text: `[Document: ${part.name || 'Uploaded document'} - Processing in document stack]`
          });
        } else {
          // Keep text and other parts as-is
          lightweightContent.push(part);
        }
      }
      
      lightweightMessages.push({
        ...message,
        content: lightweightContent
      });
    } else {
      // No attachments, keep message as-is
      lightweightMessages.push(message);
    }
  }
  
  return { lightweightMessages, attachmentReferences };
}

/**
 * Reconstruct full messages with attachment data from S3
 */
export async function reconstructMessagesWithAttachments(
  lightweightMessages: any[],
  attachmentReferences: AttachmentMetadata[]
): Promise<any[]> {
  const fullMessages = [];
  
  for (const message of lightweightMessages) {
    if (Array.isArray(message.content)) {
      const fullContent = [];
      
      for (const part of message.content) {
        if (part.type === 'text' && part.text?.startsWith('[Image:') && part.text?.includes('conversation context')) {
          // Find and restore image from S3
          const matchingAttachment = attachmentReferences.find(ref => 
            part.text.includes(ref.originalName)
          );
          
          if (matchingAttachment) {
            const attachmentData = await getAttachmentFromS3(matchingAttachment.s3Key);
            fullContent.push(attachmentData);
          } else {
            fullContent.push(part); // Keep as-is if not found
          }
        } else {
          fullContent.push(part);
        }
      }
      
      fullMessages.push({
        ...message,
        content: fullContent
      });
    } else {
      fullMessages.push(message);
    }
  }
  
  return fullMessages;
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9.-]/g, '_').substring(0, 255);
}