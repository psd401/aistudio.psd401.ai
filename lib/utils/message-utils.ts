/**
 * Message processing utilities for handling dual format compatibility
 * between legacy content format and new AI SDK v5 parts format
 */

import { createLogger } from '@/lib/logger';

// Discriminated union types for better type safety
export interface TextPart {
  type: 'text';
  text: string;
}

export interface ImagePart {
  type: 'image';
  image: string;
}

// Allow unknown part types for flexibility
export interface UnknownPart {
  type: string;
  [key: string]: unknown;
}

export type MessagePart = TextPart | ImagePart | UnknownPart;

// Discriminated union for serializable parts
export interface SerializableTextPart {
  type: 'text';
  text: string;
}

export interface SerializableImagePart {
  type: 'image';
  metadata: {
    hasImage: true;
  };
}

export type SerializablePart = SerializableTextPart | SerializableImagePart;

// Message interface supporting both formats - use flexible types
export interface MessageWithContent {
  content?: string | Array<{ type: string; text?: string; image?: string; [key: string]: unknown }>;
  parts?: Array<{ type: string; text?: string; image?: string; [key: string]: unknown }>;
}

export interface ExtractedMessageContent {
  textContent: string;
  serializableParts: SerializablePart[];
}

/**
 * Extract text content from a message supporting both legacy and new formats
 * @param message Message with content or parts
 * @returns Extracted text content
 */
export function extractMessageText(message: MessageWithContent): string {
  let messageText = '';

  // Check if message has parts (new format)
  if (message.parts && Array.isArray(message.parts)) {
    const textPart = message.parts.find((part) => 
      part.type === 'text' && 'text' in part && typeof part.text === 'string'
    );
    if (textPart && 'text' in textPart) {
      messageText = textPart.text as string;
    }
  } 
  // Fallback to legacy content format
  else if (message.content) {
    if (typeof message.content === 'string') {
      messageText = message.content;
    } else if (Array.isArray(message.content)) {
      const textPart = message.content.find((part) => 
        part.type === 'text' && 'text' in part && typeof part.text === 'string'
      );
      if (textPart && 'text' in textPart) {
        messageText = textPart.text as string;
      }
    }
  }

  return messageText;
}

/**
 * Extract both text content and serializable parts from a message
 * @param message Message with content or parts
 * @returns Object with text content and serializable parts
 */
export function extractMessageContentAndParts(message: MessageWithContent): ExtractedMessageContent {
  const log = createLogger({ context: 'message-utils' });
  let userContent = '';
  let serializableParts: SerializablePart[] = [];

  // Check if message has parts (new format)
  if (message.parts && Array.isArray(message.parts)) {
    message.parts.forEach((part) => {
      if (part.type === 'text' && 'text' in part && typeof part.text === 'string') {
        userContent += (userContent ? ' ' : '') + part.text;
        serializableParts.push({ 
          type: 'text', 
          text: part.text 
        });
      } else if (part.type === 'image' && 'image' in part) {
        // Store only boolean flag - no image data or prefixes
        serializableParts.push({ 
          type: 'image',
          metadata: {
            hasImage: true
            // No image data or prefixes stored for security/memory reasons
          }
        });
      } else {
        // Handle unknown part types gracefully
        log.warn('Unknown message part type', { partType: part.type });
      }
    });
  }
  // Fallback to legacy content format
  else if (message.content) {
    if (typeof message.content === 'string') {
      // Simple string content
      userContent = message.content;
      serializableParts = [{ type: 'text', text: message.content }];
    } else if (Array.isArray(message.content)) {
      // Content parts array (includes attachments from assistant-ui)
      message.content.forEach((part) => {
        if (part.type === 'text' && 'text' in part && typeof part.text === 'string') {
          userContent += (userContent ? ' ' : '') + part.text;
          serializableParts.push({ type: 'text', text: part.text });
        } else if (part.type === 'image' && 'image' in part) {
          // Store only boolean flag - no image data or prefixes
          serializableParts.push({ 
            type: 'image',
            metadata: {
              hasImage: true
              // No image data or prefixes stored for security/memory reasons
            }
          });
        } else {
          // Handle unknown part types gracefully
          log.warn('Unknown message part type', { partType: part.type });
        }
      });
    }
  }

  return {
    textContent: userContent,
    serializableParts
  };
}

/**
 * Generate a concise conversation title from message text
 * @param messageText Raw message text
 * @param maxLength Maximum length for the title (default: 40)
 * @returns Formatted conversation title
 */
export function generateConversationTitle(messageText: string, maxLength: number = 40): string {
  if (!messageText) {
    return 'New Conversation';
  }

  // Remove newlines and extra whitespace for header compatibility
  const cleanedText = messageText.replace(/\s+/g, ' ').trim();
  let title = cleanedText.slice(0, maxLength).trim();
  
  if (cleanedText.length > maxLength) {
    title += '...';
  }
  
  return title || 'New Conversation';
}