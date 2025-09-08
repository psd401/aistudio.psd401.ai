"use strict";
/**
 * Message conversion utilities for handling different message formats
 * between assistant-ui, AI SDK, and provider-specific formats
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.convertAssistantUIMessages = convertAssistantUIMessages;
exports.normalizeMessage = normalizeMessage;
exports.extractTextContent = extractTextContent;
exports.hasAttachments = hasAttachments;
exports.validateMessage = validateMessage;
exports.validateMessages = validateMessages;
/**
 * Pass messages through unchanged - let AI SDK convertToModelMessages handle the conversion
 */
function convertAssistantUIMessages(messages) {
    return messages.map((msg) => normalizeMessage(msg));
}
/**
 * Pass messages through unchanged - let AI SDK handle the conversion
 */
function normalizeMessage(msg) {
    // Return the message as-is and let convertToModelMessages handle proper conversion
    return msg;
}
/**
 * Extract text content from a message
 */
function extractTextContent(msg) {
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
function hasAttachments(msg) {
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
function validateMessage(msg) {
    const errors = [];
    if (!msg || typeof msg !== 'object') {
        errors.push('Message is null or undefined or not an object');
        return errors;
    }
    const message = msg;
    if (!message.role || !['user', 'assistant', 'system'].includes(message.role)) {
        errors.push(`Invalid role: ${message.role}`);
    }
    const hasContent = message.content && (typeof message.content === 'string' ||
        Array.isArray(message.content));
    const hasParts = message.parts && Array.isArray(message.parts);
    if (!hasContent && !hasParts) {
        errors.push('Message must have either content or parts');
    }
    return errors;
}
/**
 * Validate messages array
 */
function validateMessages(messages) {
    const errors = [];
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
//# sourceMappingURL=message-converter.js.map