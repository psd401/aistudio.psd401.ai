// AI SDK v5 Message Types
// These types match the actual structure returned by useChat and streaming APIs in AI SDK v5

export type TextPart = {
  type: 'text';
  text: string;
  state?: 'streaming' | 'done';
};

export type ReasoningPart = {
  type: 'reasoning';
  text: string;
  state?: 'streaming' | 'done';
  providerMetadata?: Record<string, any>;
};

export type ToolCallPart = {
  type: 'tool-call';
  toolCallId: string;
  toolName: string;
  args: any;
  state?: 'streaming' | 'partial' | 'done';
};

export type ToolResultPart = {
  type: 'tool-result';
  toolCallId: string;
  toolName: string;
  result: any;
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

export type DataPart<T = any> = {
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
  metadata?: Record<string, any>;
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

// Convert legacy message format to v5 format
export function convertLegacyMessage(message: any): UIMessageV5 {
  // If already in v5 format with parts
  if (message.parts && Array.isArray(message.parts)) {
    return message as UIMessageV5;
  }
  
  // Convert from legacy format or AI SDK Message format
  const parts: MessagePart[] = [];
  
  // Handle AI SDK v5 message format (content can be parts array)
  if (message.content && Array.isArray(message.content) && message.content.length > 0) {
    // Check if it's already parts array (has type property)
    if (message.content[0].type) {
      // It's already a parts array from AI SDK
      parts.push(...message.content);
    } else {
      // Handle array content from v4 or other formats
      message.content.forEach((item: any) => {
        if (typeof item === 'string') {
          parts.push({ type: 'text', text: item });
        } else if (item.type === 'text' && item.text) {
          parts.push({ type: 'text', text: item.text });
        } else if (item.type === 'image' && item.image) {
          parts.push({ type: 'image', image: item.image, mediaType: item.mediaType });
        }
      });
    }
  } else if (typeof message.content === 'string') {
    // Simple string content
    parts.push({ type: 'text', text: message.content });
  }
  
  return {
    id: message.id || String(Date.now()),
    role: message.role || 'user',
    parts,
    createdAt: message.createdAt,
    metadata: message.metadata
  };
}