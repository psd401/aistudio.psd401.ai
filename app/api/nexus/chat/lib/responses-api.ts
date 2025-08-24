import { createLogger, generateRequestId, startTimer } from '@/lib/logger';
import { ErrorFactories } from '@/lib/error-utils';
import OpenAI from 'openai';

const log = createLogger({ module: 'responses-api' });

export interface ResponsesAPIOptions {
  store?: boolean;
  previousResponseId?: string;
  metadata?: Record<string, unknown>;
  includeReasoning?: boolean;
}

export interface ResponsesAPIResult {
  responseId: string;
  stream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>;
  metadata?: {
    cached?: boolean;
    reasoningIncluded?: boolean;
    tokensSaved?: number;
  };
}

interface OpenAIRequestParams {
  model: string;
  messages: OpenAI.Chat.ChatCompletionMessageParam[];
  stream: true;
  store?: boolean;
  metadata?: Record<string, string>;
  previous_response_id?: string;
  include?: string[];
}

export class OpenAIResponsesAPIAdapter {
  private client: OpenAI;
  
  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }
  
  /**
   * Create a new conversation with server-side storage
   */
  async createConversation(
    messages: OpenAI.Chat.ChatCompletionMessageParam[],
    modelId: string,
    options?: ResponsesAPIOptions
  ): Promise<ResponsesAPIResult> {
    const requestId = generateRequestId();
    const timer = startTimer('responses-api.create');
    
    log.info('Creating new conversation with Responses API', {
      requestId,
      model: modelId,
      messageCount: messages.length,
      store: options?.store,
      hasMetadata: !!options?.metadata
    });
    
    try {
      const params: OpenAIRequestParams = {
        model: modelId,
        messages,
        stream: true,
        store: options?.store ?? true
      };
      
      if (options?.metadata) {
        // Convert metadata to string values as required by OpenAI
        params.metadata = Object.fromEntries(
          Object.entries(options.metadata).map(([key, value]) => [
            key,
            typeof value === 'string' ? value : JSON.stringify(value)
          ])
        );
      }
      
      // Add reasoning support for compatible models
      if (options?.includeReasoning && this.supportsReasoning(modelId)) {
        params.include = ['reasoning.encrypted_content'];
      }
      
      const stream = await this.client.chat.completions.create(params);
      
      // Extract response ID and get teed stream
      const { responseId, stream: teedStream } = await this.extractResponseIdAndTeeStream(
        stream as unknown as AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>
      );
      
      timer({ status: 'success' });
      log.info('Conversation created with Responses API', {
        requestId,
        responseId,
        model: modelId
      });
      
      return {
        responseId,
        stream: teedStream,
        metadata: {
          reasoningIncluded: options?.includeReasoning && this.supportsReasoning(modelId)
        }
      };
      
    } catch (error) {
      timer({ status: 'error' });
      log.error('Failed to create conversation with Responses API', {
        requestId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }
  
  /**
   * Continue an existing conversation using response ID
   */
  async continueConversation(
    message: string,
    previousResponseId: string,
    modelId: string,
    options?: ResponsesAPIOptions
  ): Promise<ResponsesAPIResult> {
    const requestId = generateRequestId();
    const timer = startTimer('responses-api.continue');
    
    log.info('Continuing conversation with Responses API', {
      requestId,
      previousResponseId,
      model: modelId,
      messageLength: message.length
    });
    
    try {
      const params: OpenAIRequestParams = {
        model: modelId,
        messages: [{ role: 'user', content: message }],
        stream: true,
        store: options?.store ?? true,
        previous_response_id: previousResponseId
      };
      
      // Add reasoning support
      if (options?.includeReasoning && this.supportsReasoning(modelId)) {
        params.include = ['reasoning.encrypted_content'];
      }
      
      const stream = await this.client.chat.completions.create(params);
      
      // Extract new response ID and get teed stream
      const { responseId, stream: teedStream } = await this.extractResponseIdAndTeeStream(
        stream as unknown as AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>
      );
      
      timer({ status: 'success' });
      log.info('Conversation continued with Responses API', {
        requestId,
        responseId,
        previousResponseId,
        model: modelId
      });
      
      return {
        responseId,
        stream: teedStream,
        metadata: {
          cached: true,
          tokensSaved: this.estimateTokensSaved()
        }
      };
      
    } catch (error) {
      timer({ status: 'error' });
      log.error('Failed to continue conversation with Responses API', {
        requestId,
        previousResponseId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }
  
  /**
   * Fork a conversation at a specific message
   */
  async forkConversation(
    message: string,
    previousResponseId: string,
    modelId: string,
    options?: ResponsesAPIOptions
  ): Promise<ResponsesAPIResult> {
    const requestId = generateRequestId();
    const timer = startTimer('responses-api.fork');
    
    log.info('Forking conversation with Responses API', {
      requestId,
      previousResponseId,
      model: modelId
    });
    
    try {
      // Forking is essentially continuing with a different message
      // The new response creates a branching point
      const result = await this.continueConversation(
        message,
        previousResponseId,
        modelId,
        {
          ...options,
          metadata: {
            ...options?.metadata,
            forkedFrom: previousResponseId,
            forkTimestamp: new Date().toISOString()
          }
        }
      );
      
      timer({ status: 'success' });
      log.info('Conversation forked with Responses API', {
        requestId,
        newResponseId: result.responseId,
        forkedFrom: previousResponseId
      });
      
      return result;
      
    } catch (error) {
      timer({ status: 'error' });
      log.error('Failed to fork conversation with Responses API', {
        requestId,
        previousResponseId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }
  
  /**
   * Check if a model supports reasoning traces
   */
  private supportsReasoning(modelId: string): boolean {
    const reasoningModels = [
      'gpt-5',
      'gpt-5-turbo',
      'o1',
      'o1-mini',
      'o1-preview',
      'o3',
      'o3-mini'
    ];
    
    return reasoningModels.some(model => 
      modelId.toLowerCase().includes(model.toLowerCase())
    );
  }
  
  /**
   * Extract response ID and return both ID and teed stream
   */
  private async extractResponseIdAndTeeStream(
    stream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>
  ): Promise<{ responseId: string; stream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk> }> {
    const iterator = stream[Symbol.asyncIterator]();
    const firstChunk = await iterator.next();
    
    if (!firstChunk.value?.id) {
      throw ErrorFactories.externalServiceError('OpenAI', new Error('No response ID found in stream'));
    }
    
    const responseId = firstChunk.value.id;
    
    // Create a new stream that includes the first chunk
    const teedStream = this.createTeedStream(firstChunk.value, iterator);
    
    return {
      responseId,
      stream: teedStream
    };
  }

  /**
   * Create a stream that prepends the first chunk to the remaining stream
   */
  private async *createTeedStream(
    firstChunk: OpenAI.Chat.Completions.ChatCompletionChunk,
    iterator: AsyncIterator<OpenAI.Chat.Completions.ChatCompletionChunk>
  ): AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk> {
    // Yield the first chunk
    yield firstChunk;
    
    // Yield the remaining chunks
    let result = await iterator.next();
    while (!result.done) {
      yield result.value;
      result = await iterator.next();
    }
  }
  
  /**
   * Estimate tokens saved by using response continuation
   */
  private estimateTokensSaved(): number {
    // Rough estimate: average conversation history is 500-2000 tokens
    // With Responses API, we save sending all that context
    return 1000; // Conservative estimate
  }
  
  /**
   * Get conversation history (if available)
   * Note: This might require additional API endpoints in the future
   */
  async getConversationHistory(
    responseId: string
  ): Promise<OpenAI.Chat.ChatCompletionMessageParam[] | null> {
    log.warn('Getting conversation history not yet implemented', {
      responseId,
      note: 'Waiting for OpenAI to provide history retrieval API'
    });
    
    // This will be implemented when OpenAI provides an endpoint
    // to retrieve conversation history by response ID
    return null;
  }
}

/**
 * Factory function to create Responses API adapter
 */
export function createResponsesAPIAdapter(apiKey: string): OpenAIResponsesAPIAdapter {
  return new OpenAIResponsesAPIAdapter(apiKey);
}