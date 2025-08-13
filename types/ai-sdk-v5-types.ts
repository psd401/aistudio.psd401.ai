// AI SDK v5 Message Types
// These types match the actual structure returned by useChat and streaming APIs in AI SDK v5

// Type definitions for improved type safety
export type ProviderMetadata = {
  source?: string;
  timestamp?: number;
  [key: string]: unknown;
};

export type ToolCallArgs = {
  [key: string]: unknown;
};

export type ToolResult = {
  [key: string]: unknown;
};

export type MessageMetadata = {
  source?: string;
  timestamp?: number;
  [key: string]: unknown;
};

export type TextPart = {
  type: 'text';
  text: string;
  state?: 'streaming' | 'done';
};

export type ReasoningPart = {
  type: 'reasoning';
  text: string;
  state?: 'streaming' | 'done';
  providerMetadata?: ProviderMetadata;
};

export type ToolCallPart = {
  type: 'tool-call';
  toolCallId: string;
  toolName: string;
  args: ToolCallArgs;
  state?: 'streaming' | 'partial' | 'done';
};

export type ToolResultPart = {
  type: 'tool-result';
  toolCallId: string;
  toolName: string;
  result: ToolResult;
  isError?: boolean;
};

export type FilePart = {
  type: 'file';
  data: string | Uint8Array | Buffer | ArrayBuffer | URL;
  mediaType: string;
  filename?: string;
};

export type ImagePart = {
  type: 'image';
  image: string | Uint8Array | Buffer | ArrayBuffer | URL;
  mediaType?: string;
};

export type DataPart<T = unknown> = {
  type: `data-${string}`;
  id?: string;
  data: T;
};

export type SourcePart = {
  type: 'source';
  sourceType: 'url';
  id: string;
  url: string;
  title?: string;
};

export type MessagePart = 
  | TextPart 
  | ReasoningPart 
  | ToolCallPart 
  | ToolResultPart 
  | FilePart 
  | ImagePart 
  | DataPart 
  | SourcePart;

export interface UIMessageV5 {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'data';
  parts: MessagePart[];
  createdAt?: Date;
  metadata?: MessageMetadata;
}

// Helper function to extract text content from parts
export function extractTextFromParts(parts: MessagePart[]): string {
  return parts
    .filter((part): part is TextPart => part.type === 'text')
    .map(part => part.text)
    .join('');
}

// Helper function to extract reasoning from parts
export function extractReasoningFromParts(parts: MessagePart[]): string {
  return parts
    .filter((part): part is ReasoningPart => part.type === 'reasoning')
    .map(part => part.text)
    .join('\n\n');
}

// Helper to check if message has reasoning
export function hasReasoning(message: UIMessageV5): boolean {
  return message.parts.some(part => part.type === 'reasoning');
}

// Helper to check if message has tool calls
export function hasToolCalls(message: UIMessageV5): boolean {
  return message.parts.some(part => part.type === 'tool-call');
}

// Helper to check if message has files/images
export function hasMedia(message: UIMessageV5): boolean {
  return message.parts.some(part => part.type === 'file' || part.type === 'image');
}

// Type for possible legacy message formats
export type LegacyMessage = {
  id?: string;
  role?: 'user' | 'assistant' | 'system' | 'data';
  content?: string | Array<unknown>;
  parts?: MessagePart[];
  createdAt?: Date;
  metadata?: MessageMetadata;
};

// Convert legacy message format to v5 format
export function convertLegacyMessage(message: unknown): UIMessageV5 {
  // Validate input
  if (!message || typeof message !== 'object') {
    throw new Error('Invalid message format: expected object');
  }
  // Type guard for v5 format
  const isV5Message = (msg: unknown): msg is UIMessageV5 => {
    return (
      typeof msg === 'object' &&
      msg !== null &&
      'parts' in msg &&
      Array.isArray((msg as UIMessageV5).parts)
    );
  };

  // If already in v5 format with parts
  if (isV5Message(message)) {
    return message;
  }
  
  // Convert from legacy format or AI SDK Message format
  const parts: MessagePart[] = [];
  
  // Cast message to a more flexible type for accessing properties
  const msgWithContent = message as { content?: unknown; [key: string]: unknown };
  
  // Handle AI SDK v5 message format (content can be parts array)
  if (msgWithContent.content && Array.isArray(msgWithContent.content) && msgWithContent.content.length > 0) {
    // Check if it's already parts array (has type property)
    const firstItem = msgWithContent.content[0] as { type?: string };
    if (firstItem.type) {
      // It's already a parts array from AI SDK
      parts.push(...(msgWithContent.content as MessagePart[]));
    } else {
      // Handle array content from v4 or other formats
      msgWithContent.content.forEach((item: unknown) => {
        if (typeof item === 'string') {
          parts.push({ type: 'text', text: item });
        } else if (
          typeof item === 'object' &&
          item !== null &&
          'type' in item &&
          'text' in item &&
          (item as { type: string; text: string }).type === 'text'
        ) {
          parts.push({ type: 'text', text: (item as { text: string }).text });
        } else if (
          typeof item === 'object' &&
          item !== null &&
          'type' in item &&
          'image' in item &&
          (item as { type: string }).type === 'image'
        ) {
          const imageItem = item as { image: string | Uint8Array | Buffer | ArrayBuffer | URL; mediaType?: string };
          parts.push({ type: 'image', image: imageItem.image, mediaType: imageItem.mediaType });
        }
      });
    }
  } else if (typeof msgWithContent.content === 'string') {
    // Simple string content
    parts.push({ type: 'text', text: msgWithContent.content });
  }
  
  const typedMessage = message as { 
    id?: string; 
    role?: 'user' | 'assistant' | 'system' | 'data';
    createdAt?: Date;
    metadata?: MessageMetadata;
  };
  
  return {
    id: typedMessage.id || String(Date.now()),
    role: typedMessage.role || 'user',
    parts,
    createdAt: typedMessage.createdAt,
    metadata: typedMessage.metadata
  };
}