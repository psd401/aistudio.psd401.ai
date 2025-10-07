import { createLogger, generateRequestId } from '@/lib/logger';
import type { StreamTextResult } from 'ai';

const log = createLogger({ module: 'dual-stream-merger' });

export interface DualStreamEvent {
  modelId: 'model1' | 'model2';
  type: 'content' | 'finish' | 'error';
  chunk?: string;
  error?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishReason?: string;
}

/**
 * Merges two AI streaming responses into a single SSE stream with model identification
 * Each chunk includes a modelId to distinguish between the two parallel streams
 */
export async function* mergeStreamsWithIdentifiers(
  stream1Promise: StreamTextResult<never, never>,
  stream2Promise: StreamTextResult<never, never>
): AsyncGenerator<string> {
  const requestId = generateRequestId();
  const encoder = new TextEncoder();

  log.info('Starting dual stream merge', { requestId });

  try {
    // Wait for both stream promises to resolve
    const [stream1Result, stream2Result] = await Promise.all([
      stream1Promise,
      stream2Promise
    ]);

    // Process both streams in parallel
    const streamTasks = [
      processStream(stream1Result, 'model1', requestId),
      processStream(stream2Result, 'model2', requestId)
    ];

    // Yield chunks as they arrive from either stream
    for await (const eventData of mergeAsyncIterables(streamTasks)) {
      const sseEvent = `data: ${JSON.stringify(eventData)}\n\n`;
      yield encoder.encode(sseEvent).toString();
    }

    log.info('Dual stream merge completed', { requestId });
  } catch (error) {
    log.error('Dual stream merge failed', {
      requestId,
      error: error instanceof Error ? error.message : String(error)
    });

    // Send error event
    const errorEvent: DualStreamEvent = {
      modelId: 'model1', // Generic error affects both
      type: 'error',
      error: error instanceof Error ? error.message : 'Stream merge failed'
    };
    yield encoder.encode(`data: ${JSON.stringify(errorEvent)}\n\n`).toString();
  }
}

/**
 * Process a single stream and yield SSE events with model identification
 */
async function* processStream(
  streamResult: StreamTextResult<never, never>,
  modelId: 'model1' | 'model2',
  requestId: string
): AsyncGenerator<DualStreamEvent> {
  log.debug('Processing stream', { requestId, modelId });

  try {
    // Stream the text chunks
    for await (const chunk of streamResult.textStream) {
      const event: DualStreamEvent = {
        modelId,
        type: 'content',
        chunk
      };
      yield event;
    }

    // Wait for final result
    const result = await streamResult;

    // Wait for usage data (it's a promise in AI SDK v5)
    const usage = await result.usage;
    const finishReason = await result.finishReason;

    // Send completion event with usage data
    const finishEvent: DualStreamEvent = {
      modelId,
      type: 'finish',
      usage: usage ? {
        promptTokens: usage.inputTokens || 0,
        completionTokens: usage.outputTokens || 0,
        totalTokens: (usage.inputTokens || 0) + (usage.outputTokens || 0)
      } : undefined,
      finishReason: finishReason
    };
    yield finishEvent;

    log.info('Stream processing completed', {
      requestId,
      modelId,
      usage: result.usage
    });
  } catch (error) {
    log.error('Stream processing failed', {
      requestId,
      modelId,
      error: error instanceof Error ? error.message : String(error)
    });

    // Send error event for this specific model
    const errorEvent: DualStreamEvent = {
      modelId,
      type: 'error',
      error: error instanceof Error ? error.message : 'Stream processing failed'
    };
    yield errorEvent;
  }
}

/**
 * Merge multiple async iterables into a single async iterable
 * Yields items as they become available from any source
 */
async function* mergeAsyncIterables<T>(
  iterables: AsyncGenerator<T>[]
): AsyncGenerator<T> {
  const promises: Promise<IteratorResult<T>>[] = iterables.map(it => it.next());
  const generators = [...iterables];

  while (promises.length > 0) {
    // Wait for the first promise to resolve
    const { value, done, index } = await Promise.race(
      promises.map((p, i) => p.then(result => ({ ...result, index: i })))
    );

    if (!done) {
      yield value;
      // Replace the resolved promise with the next value from the same generator
      promises[index] = generators[index].next();
    } else {
      // Remove completed generator and its promise
      promises.splice(index, 1);
      generators.splice(index, 1);
    }
  }
}
