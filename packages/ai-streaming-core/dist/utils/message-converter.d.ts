/**
 * Message conversion utilities for handling different message formats
 * between assistant-ui, AI SDK, and provider-specific formats
 */
export interface MessagePart {
    type: string;
    text?: string;
    image?: string;
    [key: string]: unknown;
}
export interface AssistantUIMessage {
    id?: string;
    role: 'user' | 'assistant' | 'system';
    content?: string | MessagePart[];
    parts?: MessagePart[];
    metadata?: Record<string, unknown>;
    createdAt?: string;
    attachments?: unknown[];
}
export interface CoreMessage {
    role: 'user' | 'assistant' | 'system';
    parts: MessagePart[];
    [key: string]: unknown;
}
/**
 * Pass messages through unchanged - let AI SDK convertToModelMessages handle the conversion
 */
export declare function convertAssistantUIMessages(messages: AssistantUIMessage[]): AssistantUIMessage[];
/**
 * Pass messages through unchanged - let AI SDK handle the conversion
 */
export declare function normalizeMessage(msg: AssistantUIMessage): AssistantUIMessage;
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
export declare function validateMessage(msg: unknown): string[];
/**
 * Validate messages array
 */
export declare function validateMessages(messages: unknown[]): {
    isValid: boolean;
    errors: string[];
};
