-- Migration 033: AI Streaming Jobs - Bare minimum table creation

DROP TABLE IF EXISTS ai_streaming_jobs CASCADE;

CREATE TABLE ai_streaming_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id TEXT,
  user_id INTEGER NOT NULL,
  model_id INTEGER NOT NULL,
  status job_status NOT NULL DEFAULT 'pending',
  request_data JSONB NOT NULL,
  response_data JSONB,
  partial_content TEXT,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE
);