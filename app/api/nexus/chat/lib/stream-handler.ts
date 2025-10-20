import { createLogger, generateRequestId } from '@/lib/logger';
import OpenAI from 'openai';
import type {
  TextDeltaEvent,
  TextStartEvent,
  TextEndEvent,
  ToolCallEvent,
  ErrorEvent,
  FinishEvent
} from '@/lib/streaming/sse-event-types';

// Extended chunk interface for reasoning and usage data
interface ExtendedChunk {
  reasoning?: {
    encrypted_content?: string;
  };
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    reasoning_tokens?: number;
  };
}

// Artifact interface for Anthropic streams
interface Artifact {
  id: string;
  type: string;
  name?: string;
  content?: unknown;
}

// Anthropic stream chunk interface
interface AnthropicChunk {
  type: string;
  delta?: {
    text?: string;
  };
  id?: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
}

// Gemini stream chunk interface  
interface GeminiChunk {
  text?: string;
  functionCall?: {
    name: string;
    args?: unknown;
  };
}

const log = createLogger({ module: 'stream-handler' });

/**
 * Legacy StreamEvent interface for backward compatibility
 * New code should use SSEEvent types from sse-event-types.ts
 * @deprecated Use SSEEvent union type instead
 */
export interface StreamEvent {
  type: 'text' | 'tool_use' | 'artifact' | 'thinking' | 'error' | 'metadata' | 'done';
  content: string;
  metadata?: {
    responseId?: string;
    cacheKey?: string;
    toolName?: string;
    artifactId?: string;
    thinkingTrace?: string;
    usage?: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
      reasoningTokens?: number;
    };
  };
}

/**
 * Extended SSE event types for Nexus Chat specific needs
 * These complement the canonical SSE events with Nexus-specific metadata
 */
export interface NexusToolUseEvent {
  type: 'tool-use';
  toolCallId: string;
  toolName: string;
  args: unknown;
  id?: string;
  timestamp?: string;
}

export interface NexusThinkingEvent {
  type: 'thinking';
  trace: string;
  id?: string;
  timestamp?: string;
}

export interface NexusArtifactEvent {
  type: 'artifact';
  artifactId: string;
  content: unknown;
  id?: string;
  timestamp?: string;
}

/**
 * Union of all Nexus-specific SSE events plus canonical events
 */
export type NexusSSEEvent =
  | TextStartEvent
  | TextDeltaEvent
  | TextEndEvent
  | ToolCallEvent
  | ErrorEvent
  | FinishEvent
  | NexusToolUseEvent
  | NexusThinkingEvent
  | NexusArtifactEvent;

export class NexusStreamHandler {
  private encoder = new TextEncoder();
  
  /**
   * Convert OpenAI stream to Server-Sent Events using canonical SSE types
   */
  async *handleOpenAIStream(
    stream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>,
    responseId?: string
  ): AsyncGenerator<Uint8Array> {
    const requestId = generateRequestId();

    log.info('Starting OpenAI stream handling', {
      requestId,
      responseId
    });

    try {
      let totalContent = '';
      let usage: { promptTokens: number; completionTokens: number; totalTokens: number; reasoningTokens?: number } | undefined;

      // Emit text-start event at the beginning of the stream
      if (responseId) {
        const startEvent: TextStartEvent = {
          type: 'text-start',
          id: responseId
        };
        yield this.formatSSE(startEvent);
      }

      for await (const chunk of stream) {

        // Handle text content using canonical text-delta event
        if (chunk.choices?.[0]?.delta?.content) {
          const content = chunk.choices[0].delta.content;
          totalContent += content;

          const event: TextDeltaEvent = {
            type: 'text-delta',
            delta: content  // Use canonical 'delta' field instead of 'content'
          };

          yield this.formatSSE(event);
        }

        // Handle tool calls using canonical tool-call event
        if (chunk.choices?.[0]?.delta?.tool_calls) {
          for (const toolCall of chunk.choices[0].delta.tool_calls) {
            const event: ToolCallEvent = {
              type: 'tool-call',
              toolCallId: toolCall.id || `tool-${Date.now()}`,
              toolName: toolCall.function?.name || 'unknown',
              args: toolCall.function?.arguments ? JSON.parse(toolCall.function.arguments) : undefined
            };

            yield this.formatSSE(event);
          }
        }

        // Handle reasoning traces (for o1, o3 models) using custom thinking event
        const extendedChunk = chunk as ExtendedChunk;
        if (extendedChunk.reasoning?.encrypted_content) {
          const event: NexusThinkingEvent = {
            type: 'thinking',
            trace: extendedChunk.reasoning.encrypted_content
          };

          yield this.formatSSE(event);
        }

        // Capture usage data
        if (extendedChunk.usage) {
          usage = {
            promptTokens: extendedChunk.usage.prompt_tokens || 0,
            completionTokens: extendedChunk.usage.completion_tokens || 0,
            totalTokens: extendedChunk.usage.total_tokens || 0,
            reasoningTokens: extendedChunk.usage.reasoning_tokens
          };
        }
      }

      // Send text-end event
      if (responseId) {
        const endEvent: TextEndEvent = {
          type: 'text-end',
          id: responseId
        };
        yield this.formatSSE(endEvent);
      }

      // Send finish event with usage using canonical finish event
      const finishEvent: FinishEvent = {
        type: 'finish',
        usage: usage ? {
          promptTokens: usage.promptTokens,
          completionTokens: usage.completionTokens,
          totalTokens: usage.totalTokens
        } : undefined
      };

      yield this.formatSSE(finishEvent);

      log.info('OpenAI stream completed', {
        requestId,
        responseId,
        contentLength: totalContent.length,
        usage
      });

    } catch (error) {
      log.error('Error in OpenAI stream handling', {
        requestId,
        error: error instanceof Error ? error.message : String(error)
      });

      // Use canonical error event
      const errorEvent: ErrorEvent = {
        type: 'error',
        error: error instanceof Error ? error.message : 'Stream processing error'
      };

      yield this.formatSSE(errorEvent);
      throw error;
    }
  }
  
  /**
   * Handle Anthropic streaming with artifacts using canonical SSE types
   */
  async *handleAnthropicStream(
    stream: AsyncIterable<AnthropicChunk>,
    conversationId: string
  ): AsyncGenerator<Uint8Array> {
    const requestId = generateRequestId();

    log.info('Starting Anthropic stream handling', {
      requestId,
      conversationId
    });

    try {
      let totalContent = '';
      const artifacts: Artifact[] = [];

      // Emit text-start event
      const startEvent: TextStartEvent = {
        type: 'text-start',
        id: conversationId
      };
      yield this.formatSSE(startEvent);

      for await (const chunk of stream) {
        // Handle text content using canonical text-delta event
        if (chunk.type === 'content_block_delta' && chunk.delta?.text) {
          const content = chunk.delta.text;
          totalContent += content;

          const event: TextDeltaEvent = {
            type: 'text-delta',
            delta: content  // Use canonical 'delta' field
          };

          yield this.formatSSE(event);
        }

        // Handle artifacts using custom Nexus artifact event
        if (chunk.type === 'artifact') {
          const artifact = chunk as unknown as Artifact;
          artifacts.push(artifact);

          const event: NexusArtifactEvent = {
            type: 'artifact',
            artifactId: artifact.id,
            content: chunk
          };

          yield this.formatSSE(event);
        }

        // Handle completion
        if (chunk.type === 'message_complete') {
          const usage = chunk.usage;

          // Emit text-end event
          const endEvent: TextEndEvent = {
            type: 'text-end',
            id: conversationId
          };
          yield this.formatSSE(endEvent);

          // Send finish event with usage using canonical finish event
          const finishEvent: FinishEvent = {
            type: 'finish',
            usage: usage ? {
              promptTokens: usage.input_tokens,
              completionTokens: usage.output_tokens,
              totalTokens: usage.input_tokens + usage.output_tokens
            } : undefined
          };

          yield this.formatSSE(finishEvent);
        }
      }

      log.info('Anthropic stream completed', {
        requestId,
        conversationId,
        contentLength: totalContent.length,
        artifactCount: artifacts.length
      });

    } catch (error) {
      log.error('Error in Anthropic stream handling', {
        requestId,
        error: error instanceof Error ? error.message : String(error)
      });

      // Use canonical error event
      const errorEvent: ErrorEvent = {
        type: 'error',
        error: error instanceof Error ? error.message : 'Stream processing error'
      };

      yield this.formatSSE(errorEvent);
      throw error;
    }
  }
  
  /**
   * Handle Google Gemini streaming using canonical SSE types
   */
  async *handleGeminiStream(
    stream: AsyncIterable<GeminiChunk>,
    conversationId: string
  ): AsyncGenerator<Uint8Array> {
    const requestId = generateRequestId();

    log.info('Starting Gemini stream handling', {
      requestId,
      conversationId
    });

    try {
      let totalContent = '';

      // Emit text-start event
      const startEvent: TextStartEvent = {
        type: 'text-start',
        id: conversationId
      };
      yield this.formatSSE(startEvent);

      for await (const chunk of stream) {
        // Handle text content using canonical text-delta event
        if (chunk.text) {
          const content = chunk.text;
          totalContent += content;

          const event: TextDeltaEvent = {
            type: 'text-delta',
            delta: content  // Use canonical 'delta' field
          };

          yield this.formatSSE(event);
        }

        // Handle function calls using canonical tool-call event
        if (chunk.functionCall) {
          const event: ToolCallEvent = {
            type: 'tool-call',
            toolCallId: `gemini-tool-${Date.now()}`,
            toolName: chunk.functionCall.name,
            args: chunk.functionCall.args as Record<string, unknown> | undefined
          };

          yield this.formatSSE(event);
        }
      }

      // Emit text-end event
      const endEvent: TextEndEvent = {
        type: 'text-end',
        id: conversationId
      };
      yield this.formatSSE(endEvent);

      // Send finish event using canonical finish event
      const finishEvent: FinishEvent = {
        type: 'finish'
      };

      yield this.formatSSE(finishEvent);

      log.info('Gemini stream completed', {
        requestId,
        conversationId,
        contentLength: totalContent.length
      });

    } catch (error) {
      log.error('Error in Gemini stream handling', {
        requestId,
        error: error instanceof Error ? error.message : String(error)
      });

      // Use canonical error event
      const errorEvent: ErrorEvent = {
        type: 'error',
        error: error instanceof Error ? error.message : 'Stream processing error'
      };

      yield this.formatSSE(errorEvent);
      throw error;
    }
  }
  
  /**
   * Format event as Server-Sent Event
   * Accepts both canonical SSE events and legacy StreamEvent for backward compatibility
   */
  private formatSSE(event: NexusSSEEvent | StreamEvent): Uint8Array {
    // Validate event structure
    if (!event.type) {
      const error = new Error('SSE event missing required type field');
      log.error('Invalid SSE event', { error: error.message });
      throw error;
    }

    const data = JSON.stringify(event);
    return this.encoder.encode(`data: ${data}\n\n`);
  }

  /**
   * Helper method to create a legacy StreamEvent from SSE events
   * Used for backward compatibility with existing frontend code
   * @deprecated Remove when frontend is updated to use canonical SSE events
   */
  private toLegacyEvent(event: NexusSSEEvent): StreamEvent {
    // Map canonical events to legacy format
    switch (event.type) {
      case 'text-delta':
        return {
          type: 'text',
          content: event.delta
        };
      case 'tool-call':
        return {
          type: 'tool_use',
          content: JSON.stringify({ toolName: event.toolName, args: event.args }),
          metadata: {
            toolName: event.toolName
          }
        };
      case 'error':
        return {
          type: 'error',
          content: event.error
        };
      case 'finish':
        return {
          type: 'done',
          content: '',
          metadata: event.usage ? {
            usage: {
              promptTokens: event.usage.promptTokens || 0,
              completionTokens: event.usage.completionTokens || 0,
              totalTokens: event.usage.totalTokens || 0
            }
          } : undefined
        };
      default:
        // For custom Nexus events, pass through
        return event as unknown as StreamEvent;
    }
  }
  
  /**
   * Create a readable stream from async generator
   */
  createReadableStream(
    generator: AsyncGenerator<Uint8Array>
  ): ReadableStream<Uint8Array> {
    return new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of generator) {
            controller.enqueue(chunk);
          }
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      }
    });
  }
}

export const streamHandler = new NexusStreamHandler();