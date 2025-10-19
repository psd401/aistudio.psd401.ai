-- Migration 037: Assistant Architect Execution Events
-- Stores Server-Sent Events (SSE) for assistant architect executions
-- Provides audit trail and enables real-time progress tracking

-- Create event types enum
CREATE TYPE assistant_event_type AS ENUM (
  'execution-start',
  'execution-complete',
  'execution-error',
  'prompt-start',
  'prompt-complete',
  'variable-substitution',
  'knowledge-retrieval-start',
  'knowledge-retrieved',
  'tool-execution-start',
  'tool-execution-complete',
  'progress'
);

-- Create events table
CREATE TABLE assistant_architect_events (
  id SERIAL PRIMARY KEY,
  execution_id INTEGER NOT NULL REFERENCES tool_executions(id) ON DELETE CASCADE,
  event_type assistant_event_type NOT NULL,
  event_data JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for efficient querying
CREATE INDEX idx_assistant_events_execution ON assistant_architect_events (execution_id, created_at);
CREATE INDEX idx_assistant_events_type ON assistant_architect_events (event_type, created_at);

-- Add comments for documentation
COMMENT ON TABLE assistant_architect_events IS 'Stores Server-Sent Events for assistant architect executions, providing fine-grained progress tracking and audit trail';
COMMENT ON COLUMN assistant_architect_events.event_data IS 'JSON data matching the SSE event type schema defined in types/sse-events.ts';
