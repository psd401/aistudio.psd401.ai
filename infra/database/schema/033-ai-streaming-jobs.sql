-- Migration 033: AI Streaming Jobs - Universal polling architecture for AWS Amplify timeout mitigation
-- This table enables universal polling for all AI streaming requests to overcome AWS Amplify's 30-second timeout limit

-- Create job status enum
CREATE TYPE job_status AS ENUM (
  'pending',     -- Job created, waiting to be picked up
  'processing',  -- Job picked up by worker, initializing
  'streaming',   -- Actively streaming from AI provider
  'completed',   -- Successfully completed
  'failed',      -- Failed with error
  'cancelled'    -- User cancelled request
);

-- Create the ai_streaming_jobs table
CREATE TABLE ai_streaming_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Foreign key relationships
  conversation_id INTEGER REFERENCES conversations(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  model_id INTEGER REFERENCES ai_models(id) ON DELETE CASCADE,
  
  -- Job metadata
  status job_status NOT NULL DEFAULT 'pending',
  request_data JSONB NOT NULL,        -- Original request (messages, options, etc.)
  response_data JSONB,                -- Final response when completed
  partial_content TEXT,               -- Current streaming content (updated progressively)
  progress_info JSONB DEFAULT '{}'::jsonb, -- Progress metadata (tokens, percentage, etc.)
  error_message TEXT,                 -- Error details if failed
  
  -- Timing information
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  started_at TIMESTAMP WITH TIME ZONE,    -- When worker picked up job
  completed_at TIMESTAMP WITH TIME ZONE,  -- When job finished (success or failure)
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '2 hours'),
  
  -- Additional metadata
  source VARCHAR(50) DEFAULT 'chat',  -- Source system (chat, compare, assistant, etc.)
  session_id VARCHAR(255),            -- User session for telemetry
  request_id VARCHAR(255),            -- Unique request identifier
  
  -- Constraints
  CONSTRAINT valid_timestamps CHECK (
    (started_at IS NULL OR started_at >= created_at) AND
    (completed_at IS NULL OR completed_at >= created_at) AND
    (expires_at > created_at)
  ),
  CONSTRAINT valid_status_transitions CHECK (
    (status = 'pending' AND started_at IS NULL AND completed_at IS NULL) OR
    (status = 'processing' AND started_at IS NOT NULL AND completed_at IS NULL) OR
    (status = 'streaming' AND started_at IS NOT NULL AND completed_at IS NULL) OR
    (status IN ('completed', 'failed', 'cancelled') AND completed_at IS NOT NULL)
  )
);

-- Indexes for performance optimization

-- Primary polling query: user's active jobs
CREATE INDEX idx_streaming_jobs_user_active 
ON ai_streaming_jobs(user_id, status, created_at DESC) 
WHERE status IN ('pending', 'processing', 'streaming');

-- Worker query: pick up pending jobs
CREATE INDEX idx_streaming_jobs_worker_queue 
ON ai_streaming_jobs(status, created_at ASC) 
WHERE status = 'pending';

-- Cleanup query: find expired jobs
CREATE INDEX idx_streaming_jobs_cleanup 
ON ai_streaming_jobs(expires_at) 
WHERE status IN ('completed', 'failed', 'cancelled');

-- Session tracking for user management
CREATE INDEX idx_streaming_jobs_session 
ON ai_streaming_jobs(session_id, created_at DESC) 
WHERE session_id IS NOT NULL;

-- Conversation context query
CREATE INDEX idx_streaming_jobs_conversation 
ON ai_streaming_jobs(conversation_id, created_at DESC) 
WHERE conversation_id IS NOT NULL;

-- Model performance analytics
CREATE INDEX idx_streaming_jobs_model_analytics 
ON ai_streaming_jobs(model_id, status, created_at) 
WHERE status IN ('completed', 'failed');

-- Request ID lookup for debugging
CREATE INDEX idx_streaming_jobs_request_id 
ON ai_streaming_jobs(request_id) 
WHERE request_id IS NOT NULL;

-- Add comments for documentation
COMMENT ON TABLE ai_streaming_jobs IS 'Universal polling architecture for AI streaming requests to overcome AWS Amplify timeout limitations';
COMMENT ON COLUMN ai_streaming_jobs.id IS 'Unique job identifier returned to client for polling';
COMMENT ON COLUMN ai_streaming_jobs.status IS 'Current job status for polling and worker coordination';
COMMENT ON COLUMN ai_streaming_jobs.request_data IS 'Original request data (messages, model config, options) stored as JSONB';
COMMENT ON COLUMN ai_streaming_jobs.partial_content IS 'Current streaming content updated progressively for real-time polling';
COMMENT ON COLUMN ai_streaming_jobs.progress_info IS 'Additional progress metadata (tokens streamed, completion percentage, etc.)';
COMMENT ON COLUMN ai_streaming_jobs.expires_at IS 'Automatic cleanup time to prevent database growth';

-- Create a function to update job status with validation
CREATE OR REPLACE FUNCTION update_job_status(
  job_id UUID,
  new_status job_status,
  partial_content_update TEXT DEFAULT NULL,
  progress_update JSONB DEFAULT NULL,
  error_msg TEXT DEFAULT NULL
) RETURNS BOOLEAN AS $$
DECLARE
  current_status job_status;
  rows_affected INTEGER;
BEGIN
  -- Get current status
  SELECT status INTO current_status FROM ai_streaming_jobs WHERE id = job_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job not found: %', job_id;
  END IF;
  
  -- Validate status transitions
  IF (current_status = 'pending' AND new_status NOT IN ('processing', 'cancelled')) OR
     (current_status = 'processing' AND new_status NOT IN ('streaming', 'failed', 'cancelled')) OR
     (current_status = 'streaming' AND new_status NOT IN ('completed', 'failed', 'cancelled')) OR
     (current_status IN ('completed', 'failed', 'cancelled') AND new_status != current_status) THEN
    RAISE EXCEPTION 'Invalid status transition from % to %', current_status, new_status;
  END IF;
  
  -- Update the job
  UPDATE ai_streaming_jobs 
  SET 
    status = new_status,
    started_at = CASE 
      WHEN new_status IN ('processing', 'streaming') AND started_at IS NULL 
      THEN NOW() 
      ELSE started_at 
    END,
    completed_at = CASE 
      WHEN new_status IN ('completed', 'failed', 'cancelled') AND completed_at IS NULL 
      THEN NOW() 
      ELSE completed_at 
    END,
    partial_content = COALESCE(partial_content_update, partial_content),
    progress_info = CASE 
      WHEN progress_update IS NOT NULL 
      THEN progress_info || progress_update 
      ELSE progress_info 
    END,
    error_message = CASE 
      WHEN new_status = 'failed' 
      THEN COALESCE(error_msg, error_message) 
      ELSE error_message 
    END
  WHERE id = job_id;
  
  GET DIAGNOSTICS rows_affected = ROW_COUNT;
  RETURN rows_affected > 0;
END;
$$ LANGUAGE plpgsql;

-- Create cleanup function for expired jobs
CREATE OR REPLACE FUNCTION cleanup_expired_streaming_jobs() RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  -- Delete jobs that are completed/failed/cancelled and past expiration
  DELETE FROM ai_streaming_jobs 
  WHERE expires_at < NOW() 
    AND status IN ('completed', 'failed', 'cancelled');
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  -- Also cancel jobs that are stuck in pending/processing for too long
  UPDATE ai_streaming_jobs 
  SET 
    status = 'failed',
    error_message = 'Job timed out - stuck in ' || status || ' state',
    completed_at = NOW()
  WHERE 
    status IN ('pending', 'processing') 
    AND created_at < NOW() - INTERVAL '30 minutes';
  
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON ai_streaming_jobs TO rds_iam_user;
GRANT USAGE, SELECT ON SEQUENCE ai_streaming_jobs_id_seq TO rds_iam_user;
GRANT EXECUTE ON FUNCTION update_job_status(UUID, job_status, TEXT, JSONB, TEXT) TO rds_iam_user;
GRANT EXECUTE ON FUNCTION cleanup_expired_streaming_jobs() TO rds_iam_user;