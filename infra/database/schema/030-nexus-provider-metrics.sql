-- =====================================================
-- Migration: 030-nexus-provider-metrics.sql
-- Description: Add nexus_provider_metrics table for tracking provider usage and performance
-- Author: Kris Hagel
-- Date: 2025-08-24
-- Dependencies: nexus_conversations table must exist (from 028-nexus-schema.sql)
-- =====================================================

-- Provider metrics table for tracking usage, costs, and performance per conversation
CREATE TABLE IF NOT EXISTS nexus_provider_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES nexus_conversations(id) ON DELETE CASCADE,
  
  -- Provider information
  provider VARCHAR(50) NOT NULL,
  model_id VARCHAR(100) NOT NULL,
  
  -- Token usage
  prompt_tokens INTEGER DEFAULT 0,
  completion_tokens INTEGER DEFAULT 0,
  cached_tokens INTEGER DEFAULT 0,
  reasoning_tokens INTEGER DEFAULT 0,
  
  -- Performance metrics
  response_time_ms INTEGER,
  stream_duration_ms INTEGER,
  
  -- Cost tracking
  cost_usd DECIMAL(10, 6),
  
  -- Request metadata
  request_id VARCHAR(255),
  error_message TEXT,
  status VARCHAR(50) DEFAULT 'success',
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_nexus_metrics_conversation 
  ON nexus_provider_metrics(conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_nexus_metrics_provider 
  ON nexus_provider_metrics(provider, model_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_nexus_metrics_request 
  ON nexus_provider_metrics(request_id) 
  WHERE request_id IS NOT NULL;

-- Add comments
COMMENT ON TABLE nexus_provider_metrics IS 
'Tracks detailed metrics for each AI provider request including tokens, costs, and performance';

COMMENT ON COLUMN nexus_provider_metrics.cached_tokens IS 
'Number of tokens served from cache (e.g., Anthropic prompt caching)';

COMMENT ON COLUMN nexus_provider_metrics.reasoning_tokens IS 
'Number of tokens used for reasoning/thinking (e.g., OpenAI o1 models)';

COMMENT ON COLUMN nexus_provider_metrics.cost_usd IS 
'Calculated cost in USD based on token usage and provider pricing';

-- =====================================================
-- END OF MIGRATION
-- =====================================================