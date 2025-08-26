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
export declare function convertAssistantUIMessages(messages: AssistantUIMessage[]): CoreMessage[];
/**
 * Normalize a single message to CoreMessage format with parts array
 */
export declare function normalizeMessage(msg: AssistantUIMessage): CoreMessage;
/**
 * Extract text content from a message
 */
export declare function extractTextContent(msg: AssistantUIMessage): string;
/**
 * Check if message has any attachments
 */
export declare function hasAttachments(msg: AssistantUIMessage): boolean;
/**
 * Validate message format
 */
export declare function validateMessage(msg: any): string[];
/**
 * Validate messages array
 */
export declare function validateMessages(messages: any[]): {
    isValid: boolean;
    errors: string[];
};
