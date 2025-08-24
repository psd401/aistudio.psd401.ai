import { createLogger, generateRequestId } from '@/lib/logger';
import OpenAI from 'openai';

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

export class NexusStreamHandler {
  private encoder = new TextEncoder();
  
  /**
   * Convert OpenAI stream to Server-Sent Events
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
      
      for await (const chunk of stream) {
        // Handle text content
        if (chunk.choices?.[0]?.delta?.content) {
          const content = chunk.choices[0].delta.content;
          totalContent += content;
          
          const event: StreamEvent = {
            type: 'text',
            content,
            metadata: responseId ? { responseId } : undefined
          };
          
          yield this.formatSSE(event);
        }
        
        // Handle tool calls
        if (chunk.choices?.[0]?.delta?.tool_calls) {
          for (const toolCall of chunk.choices[0].delta.tool_calls) {
            const event: StreamEvent = {
              type: 'tool_use',
              content: JSON.stringify(toolCall),
              metadata: {
                responseId,
                toolName: toolCall.function?.name
              }
            };
            
            yield this.formatSSE(event);
          }
        }
        
        // Handle reasoning traces (for o1, o3 models)
        const extendedChunk = chunk as ExtendedChunk;
        if (extendedChunk.reasoning?.encrypted_content) {
          const event: StreamEvent = {
            type: 'thinking',
            content: '',
            metadata: {
              responseId,
              thinkingTrace: extendedChunk.reasoning.encrypted_content
            }
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
      
      // Send done event with usage
      const doneEvent: StreamEvent = {
        type: 'done',
        content: totalContent,
        metadata: usage ? {
          responseId,
          usage
        } : responseId ? { responseId } : undefined
      };
      
      yield this.formatSSE(doneEvent);
      
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
      
      const errorEvent: StreamEvent = {
        type: 'error',
        content: error instanceof Error ? error.message : 'Stream processing error'
      };
      
      yield this.formatSSE(errorEvent);
      throw error;
    }
  }
  
  /**
   * Handle Anthropic streaming with artifacts
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
      
      for await (const chunk of stream) {
        // Handle text content
        if (chunk.type === 'content_block_delta' && chunk.delta?.text) {
          const content = chunk.delta.text;
          totalContent += content;
          
          const event: StreamEvent = {
            type: 'text',
            content
          };
          
          yield this.formatSSE(event);
        }
        
        // Handle artifacts
        if (chunk.type === 'artifact') {
          const artifact = chunk as unknown as Artifact;
          artifacts.push(artifact);
          
          const event: StreamEvent = {
            type: 'artifact',
            content: JSON.stringify(chunk),
            metadata: {
              artifactId: artifact.id
            }
          };
          
          yield this.formatSSE(event);
        }
        
        // Handle completion
        if (chunk.type === 'message_complete') {
          const usage = chunk.usage;
          
          const doneEvent: StreamEvent = {
            type: 'done',
            content: totalContent,
            metadata: {
              usage: usage ? {
                promptTokens: usage.input_tokens,
                completionTokens: usage.output_tokens,
                totalTokens: usage.input_tokens + usage.output_tokens
              } : undefined
            }
          };
          
          yield this.formatSSE(doneEvent);
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
      
      const errorEvent: StreamEvent = {
        type: 'error',
        content: error instanceof Error ? error.message : 'Stream processing error'
      };
      
      yield this.formatSSE(errorEvent);
      throw error;
    }
  }
  
  /**
   * Handle Google Gemini streaming
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
      
      for await (const chunk of stream) {
        // Handle text content
        if (chunk.text) {
          const content = chunk.text;
          totalContent += content;
          
          const event: StreamEvent = {
            type: 'text',
            content
          };
          
          yield this.formatSSE(event);
        }
        
        // Handle function calls
        if (chunk.functionCall) {
          const event: StreamEvent = {
            type: 'tool_use',
            content: JSON.stringify(chunk.functionCall),
            metadata: {
              toolName: chunk.functionCall.name
            }
          };
          
          yield this.formatSSE(event);
        }
      }
      
      // Send done event
      const doneEvent: StreamEvent = {
        type: 'done',
        content: totalContent
      };
      
      yield this.formatSSE(doneEvent);
      
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
      
      const errorEvent: StreamEvent = {
        type: 'error',
        content: error instanceof Error ? error.message : 'Stream processing error'
      };
      
      yield this.formatSSE(errorEvent);
      throw error;
    }
  }
  
  /**
   * Format event as Server-Sent Event
   */
  private formatSSE(event: StreamEvent): Uint8Array {
    const data = JSON.stringify(event);
    return this.encoder.encode(`data: ${data}\n\n`);
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