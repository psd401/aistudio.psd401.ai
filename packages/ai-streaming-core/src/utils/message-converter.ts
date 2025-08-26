/**
 * Message conversion utilities for handling different message formats
 * between assistant-ui, AI SDK, and provider-specific formats
 */

export interface MessagePart {
  type: string;
  text?: string;
  image?: string;
  [key: string]: any;
}

export interface AssistantUIMessage {
  id?: string;
  role: 'user' | 'assistant' | 'system';
  content?: string | MessagePart[];
  parts?: MessagePart[];
  metadata?: Record<string, any>;
  createdAt?: string;
  attachments?: any[];
}

export interface CoreMessage {
  role: 'user' | 'assistant' | 'system';
  parts: MessagePart[];
  [key: string]: any;
}

/**
 * Convert assistant-ui messages to AI SDK CoreMessage format
 */
export function convertAssistantUIMessages(messages: AssistantUIMessage[]): CoreMessage[] {
  return messages.map((msg) => normalizeMessage(msg));
}

/**
 * Normalize a single message to CoreMessage format with parts array
 */
export function normalizeMessage(msg: AssistantUIMessage): CoreMessage {
  // If message already has parts array, use it
  if (msg.parts && Array.isArray(msg.parts)) {
    return {
      role: msg.role,
      parts: msg.parts,
      ...(msg.metadata && { metadata: msg.metadata })
    };
  }
  
  // If message has content property with string, convert to parts
  if ('content' in msg && typeof msg.content === 'string') {
    return {
      role: msg.role,
      parts: [{ type: 'text', text: msg.content }],
      ...(msg.metadata && { metadata: msg.metadata })
    };
  }
  
  // If message has content property with array (assistant-ui format), use as parts
  if ('content' in msg && Array.isArray(msg.content)) {
    return {
      role: msg.role,
      parts: msg.content,
      ...(msg.metadata && { metadata: msg.metadata })
    };
  }
  
  // Fallback - create empty text part
  console.warn('Message has no content or parts, creating empty text part', { msg });
  return {
    role: msg.role,
    parts: [{ type: 'text', text: '' }],
    ...(msg.metadata && { metadata: msg.metadata })
  };
}

/**
 * Extract text content from a message
 */
export function extractTextContent(msg: AssistantUIMessage): string {
  // Try parts first
  if (msg.parts && Array.isArray(msg.parts)) {
    return msg.parts
      .filter(part => part.type === 'text' && part.text)
      .map(part => part.text)
      .join(' ');
  }
  
  // Try content
  if (msg.content) {
    if (typeof msg.content === 'string') {
      return msg.content;
    }
    if (Array.isArray(msg.content)) {
      return msg.content
        .filter(part => part.type === 'text' && part.text)
        .map(part => part.text)
        .join(' ');
    }
  }
  
  return '';
}

/**
 * Check if message has any attachments
 */
export function hasAttachments(msg: AssistantUIMessage): boolean {
  // Check attachments array
  if (msg.attachments && msg.attachments.length > 0) {
    return true;
  }
  
  // Check parts for non-text content
  if (msg.parts && Array.isArray(msg.parts)) {
    return msg.parts.some(part => part.type !== 'text');
  }
  
  // Check content array for non-text content
  if (Array.isArray(msg.content)) {
    return msg.content.some(part => part.type !== 'text');
  }
  
  return false;
}

/**
 * Validate message format
 */
export function validateMessage(msg: any): string[] {
  const errors: string[] = [];
  
  if (!msg) {
    errors.push('Message is null or undefined');
    return errors;
  }
  
  if (!msg.role || !['user', 'assistant', 'system'].includes(msg.role)) {
    errors.push(`Invalid role: ${msg.role}`);
  }
  
  const hasContent = msg.content && (
    typeof msg.content === 'string' || 
    Array.isArray(msg.content)
  );
  const hasParts = msg.parts && Array.isArray(msg.parts);
  
  if (!hasContent && !hasParts) {
    errors.push('Message must have either content or parts');
  }
  
  return errors;
}

/**
 * Validate messages array
 */
export function validateMessages(messages: any[]): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!Array.isArray(messages)) {
    return {
      isValid: false,
      errors: ['Messages must be an array']
    };
  }
  
  if (messages.length === 0) {
    return {
      isValid: false,
      errors: ['Messages array cannot be empty']
    };
  }
  
  messages.forEach((msg, index) => {
    const msgErrors = validateMessage(msg);
    msgErrors.forEach(error => {
      errors.push(`Message ${index}: ${error}`);
    });
  });
  
  return {
    isValid: errors.length === 0,
    errors
  };
}