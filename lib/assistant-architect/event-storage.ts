/**
 * Assistant Architect Event Storage
 *
 * Utilities for storing execution events in the database for audit trail and debugging.
 * These events provide fine-grained visibility into execution progress.
 *
 * @module lib/assistant-architect/event-storage
 */

import { executeSQL } from '@/lib/db/data-api-adapter';
import type { SSEEventType, SSEEventMap } from '@/types/sse-events';
import { createLogger } from '@/lib/logger';

const log = createLogger({ module: 'event-storage' });

/**
 * Store an execution event in the database
 *
 * Events are stored in the assistant_architect_events table for:
 * - Audit trail and debugging
 * - Post-execution analysis
 * - Future real-time SSE streaming
 *
 * @param executionId - The tool execution ID
 * @param eventType - The type of event
 * @param eventData - The event data payload
 */
export async function storeExecutionEvent<K extends SSEEventType>(
  executionId: number,
  eventType: K,
  eventData: Omit<SSEEventMap[K], 'timestamp' | 'eventId'>
): Promise<void> {
  try {
    // Add timestamp to event data
    const fullEventData = {
      ...eventData,
      timestamp: new Date().toISOString()
    };

    await executeSQL(
      `INSERT INTO assistant_architect_events (
        execution_id, event_type, event_data
      ) VALUES (
        :executionId, :eventType::assistant_event_type, :eventData::jsonb
      )`,
      [
        { name: 'executionId', value: { longValue: executionId } },
        { name: 'eventType', value: { stringValue: eventType } },
        { name: 'eventData', value: { stringValue: JSON.stringify(fullEventData) } }
      ]
    );

    log.debug('Event stored', { executionId, eventType });
  } catch (error) {
    // Log error but don't throw - event storage shouldn't break execution
    log.error('Failed to store execution event', {
      error: error instanceof Error ? error.message : String(error),
      executionId,
      eventType
    });
  }
}

/**
 * Retrieve all events for an execution
 *
 * @param executionId - The tool execution ID
 * @returns Array of events in chronological order
 */
export async function getExecutionEvents(
  executionId: number
): Promise<Array<{
  id: number;
  eventType: SSEEventType;
  eventData: SSEEventMap[SSEEventType];
  createdAt: string;
}>> {
  try {
    const results = await executeSQL<{
      id: number;
      eventType: string;
      eventData: string;
      createdAt: string;
    }>(
      `SELECT id, event_type as "eventType", event_data as "eventData", created_at as "createdAt"
       FROM assistant_architect_events
       WHERE execution_id = :executionId
       ORDER BY created_at ASC`,
      [{ name: 'executionId', value: { longValue: executionId } }]
    );

    return results.map(row => ({
      id: row.id,
      eventType: row.eventType as SSEEventType,
      eventData: JSON.parse(row.eventData) as SSEEventMap[SSEEventType],
      createdAt: row.createdAt
    }));
  } catch (error) {
    log.error('Failed to retrieve execution events', {
      error: error instanceof Error ? error.message : String(error),
      executionId
    });
    return [];
  }
}

/**
 * Get events of a specific type for an execution
 *
 * @param executionId - The tool execution ID
 * @param eventType - The event type to filter by
 * @returns Array of matching events
 */
export async function getExecutionEventsByType<K extends SSEEventType>(
  executionId: number,
  eventType: K
): Promise<Array<{
  id: number;
  eventData: SSEEventMap[K];
  createdAt: string;
}>> {
  try {
    const results = await executeSQL<{
      id: number;
      eventData: string;
      createdAt: string;
    }>(
      `SELECT id, event_data as "eventData", created_at as "createdAt"
       FROM assistant_architect_events
       WHERE execution_id = :executionId
         AND event_type = :eventType::assistant_event_type
       ORDER BY created_at ASC`,
      [
        { name: 'executionId', value: { longValue: executionId } },
        { name: 'eventType', value: { stringValue: eventType } }
      ]
    );

    return results.map(row => ({
      id: row.id,
      eventData: JSON.parse(row.eventData) as SSEEventMap[K],
      createdAt: row.createdAt
    }));
  } catch (error) {
    log.error('Failed to retrieve execution events by type', {
      error: error instanceof Error ? error.message : String(error),
      executionId,
      eventType
    });
    return [];
  }
}
