/**
 * SSE Event Emitter Utility
 *
 * Provides utilities for formatting and emitting Server-Sent Events (SSE)
 * for the Assistant Architect streaming API.
 *
 * Standard SSE Format:
 * ```
 * event: event-name
 * data: {"key": "value"}
 * id: optional-event-id
 *
 * ```
 *
 * @module lib/streaming/sse-event-emitter
 */

import { nanoid } from 'nanoid';
import type { SSEEventType, SSEEventMap, SSEEventEmitter } from '@/types/sse-events';
import { createLogger } from '@/lib/logger';

const log = createLogger({ module: 'sse-event-emitter' });

/**
 * Format a custom SSE event with proper structure
 *
 * @param eventType - The event type (e.g., 'prompt-start')
 * @param data - The event data payload
 * @param eventId - Optional event ID for client tracking
 * @returns Formatted SSE string
 */
export function formatSSEEvent<K extends SSEEventType>(
  eventType: K,
  data: Omit<SSEEventMap[K], 'timestamp' | 'eventId'>,
  eventId?: string
): string {
  // Add timestamp and eventId to data
  const eventData: SSEEventMap[K] = {
    ...data,
    timestamp: new Date().toISOString(),
    eventId: eventId || nanoid(10)
  } as SSEEventMap[K];

  // Format as SSE
  const parts: string[] = [];

  // Add event type
  parts.push(`event: ${eventType}`);

  // Add event ID
  parts.push(`id: ${eventData.eventId}`);

  // Add data (JSON stringified)
  parts.push(`data: ${JSON.stringify(eventData)}`);

  // End with double newline
  return parts.join('\n') + '\n\n';
}

/**
 * Create an SSE event emitter function that writes to a stream controller
 *
 * @param controller - The ReadableStream controller to write events to
 * @param encoder - TextEncoder instance for encoding strings to Uint8Array
 * @returns Type-safe event emitter function
 */
export function createSSEEventEmitter(
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder
): SSEEventEmitter {
  return <K extends SSEEventType>(
    eventType: K,
    data: Omit<SSEEventMap[K], 'timestamp' | 'eventId'>
  ): void => {
    try {
      const eventString = formatSSEEvent(eventType, data);
      controller.enqueue(encoder.encode(eventString));
    } catch (error) {
      // Log error but don't throw to avoid breaking the stream
      log.error('Failed to emit SSE event', {
        eventType,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  };
}

/**
 * Batch multiple events and emit them together
 *
 * Useful for high-frequency events to reduce overhead
 *
 * @param events - Array of events to batch
 * @returns Formatted SSE batch string
 */
export function formatSSEBatch(
  events: Array<{
    eventType: SSEEventType;
    data: Omit<SSEEventMap[SSEEventType], 'timestamp' | 'eventId'>;
  }>
): string {
  const batchData = events.map(({ eventType, data }) => ({
    event: eventType,
    data: {
      ...data,
      timestamp: new Date().toISOString(),
      eventId: nanoid(10)
    }
  }));

  return `event: batch\ndata: ${JSON.stringify(batchData)}\n\n`;
}

/**
 * Create a batching event emitter with automatic flushing
 *
 * Batches events over a time window to reduce SSE overhead
 *
 * @param controller - The ReadableStream controller
 * @param encoder - TextEncoder instance
 * @param options - Batching options
 * @returns Batching event emitter and flush function
 */
export function createBatchingEventEmitter(
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
  options: {
    /** Batch interval in milliseconds (default: 100ms) */
    batchInterval?: number;
    /** Max events per batch (default: 10) */
    maxBatchSize?: number;
    /** Event types that should be sent immediately (default: errors) */
    immediateEvents?: SSEEventType[];
  } = {}
): {
  emit: SSEEventEmitter;
  flush: () => void;
  startBatching: () => void;
  stopBatching: () => void;
} {
  const {
    batchInterval = 100,
    maxBatchSize = 10,
    immediateEvents = ['execution-error', 'execution-start']
  } = options;

  let eventBuffer: Array<{
    eventType: SSEEventType;
    data: Omit<SSEEventMap[SSEEventType], 'timestamp' | 'eventId'>;
  }> = [];
  let batchTimer: NodeJS.Timeout | null = null;

  const flush = (): void => {
    if (eventBuffer.length === 0) return;

    try {
      const batchString = formatSSEBatch(eventBuffer);
      controller.enqueue(encoder.encode(batchString));
      eventBuffer = [];
    } catch (error) {
      log.error('Failed to flush event batch', { error });
    }
  };

  const startBatching = (): void => {
    if (batchTimer) return;
    batchTimer = setInterval(flush, batchInterval);
  };

  const stopBatching = (): void => {
    if (batchTimer) {
      clearInterval(batchTimer);
      batchTimer = null;
    }
    flush(); // Flush remaining events
  };

  const emit: SSEEventEmitter = <K extends SSEEventType>(
    eventType: K,
    data: Omit<SSEEventMap[K], 'timestamp' | 'eventId'>
  ): void => {
    // Send immediately for critical events
    if (immediateEvents.includes(eventType)) {
      try {
        const eventString = formatSSEEvent(eventType, data);
        controller.enqueue(encoder.encode(eventString));
      } catch (error) {
        log.error('Failed to emit immediate event', { error });
      }
      return;
    }

    // Add to batch buffer
    eventBuffer.push({ eventType, data: data as Omit<SSEEventMap[SSEEventType], 'timestamp' | 'eventId'> });

    // Flush if batch is full
    if (eventBuffer.length >= maxBatchSize) {
      flush();
    }
  };

  // Start batching automatically
  startBatching();

  return { emit, flush, startBatching, stopBatching };
}

/**
 * Parse SSE event from client-side EventSource
 *
 * Useful for client-side event handling
 *
 * @param event - The MessageEvent from EventSource
 * @returns Parsed event data or null if invalid
 */
export function parseSSEEvent<K extends SSEEventType>(
  event: MessageEvent
): SSEEventMap[K] | null {
  try {
    const data = JSON.parse(event.data);
    return data as SSEEventMap[K];
  } catch (error) {
    log.error('Failed to parse SSE event', { error });
    return null;
  }
}
