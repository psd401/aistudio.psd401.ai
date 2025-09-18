-- 035-schedule-management-schema.sql
-- Migration to add schedule management tables for automated execution workflows
-- Part of Issue #263: Database: Schedule Management Schema

-- Scheduled executions configuration table
-- Stores user-configured automated executions with schedule settings
CREATE TABLE IF NOT EXISTS scheduled_executions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assistant_architect_id INTEGER NOT NULL REFERENCES assistant_architects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  schedule_config JSONB NOT NULL CHECK (
    schedule_config ? 'frequency' AND
    schedule_config->>'frequency' IN ('daily', 'weekly', 'monthly', 'custom')
  ), -- {frequency, time, timezone, cron}
  input_data JSONB NOT NULL,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_by TEXT,
  UNIQUE(user_id, name)
);

-- Execution results and history table
-- Tracks each execution attempt with results and performance data
CREATE TABLE IF NOT EXISTS execution_results (
  id SERIAL PRIMARY KEY,
  scheduled_execution_id INTEGER NOT NULL REFERENCES scheduled_executions(id) ON DELETE CASCADE,
  result_data JSONB NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success', 'failed', 'running')),
  executed_at TIMESTAMP DEFAULT NOW(),
  execution_duration_ms INTEGER,
  error_message TEXT
);

-- User notifications table
-- Manages notification delivery for execution results
CREATE TABLE IF NOT EXISTS user_notifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  execution_result_id INTEGER NOT NULL REFERENCES execution_results(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('email', 'in_app')),
  status TEXT NOT NULL CHECK (status IN ('sent', 'delivered', 'read', 'failed')),
  delivery_attempts INTEGER DEFAULT 0,
  last_attempt_at TIMESTAMP,
  failure_reason TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for performance optimization

-- Scheduled executions indexes
CREATE INDEX IF NOT EXISTS idx_scheduled_executions_user_active
ON scheduled_executions(user_id, active);

CREATE INDEX IF NOT EXISTS idx_scheduled_executions_assistant_architect
ON scheduled_executions(assistant_architect_id);

-- Execution results indexes
CREATE INDEX IF NOT EXISTS idx_execution_results_scheduled_execution_executed_at
ON execution_results(scheduled_execution_id, executed_at);

CREATE INDEX IF NOT EXISTS idx_execution_results_status
ON execution_results(status);

-- User notifications indexes
CREATE INDEX IF NOT EXISTS idx_user_notifications_user_status_created
ON user_notifications(user_id, status, created_at);

CREATE INDEX IF NOT EXISTS idx_user_notifications_execution_result
ON user_notifications(execution_result_id);

CREATE INDEX IF NOT EXISTS idx_user_notifications_delivery_attempts
ON user_notifications(delivery_attempts, last_attempt_at) WHERE status = 'failed';
