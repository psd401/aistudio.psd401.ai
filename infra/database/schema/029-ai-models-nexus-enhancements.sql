-- =====================================================
-- Migration: 029-ai-models-nexus-enhancements.sql
-- Description: Enhanced AI models table for Nexus provider factory with pricing, performance, and capability tracking
-- Author: Kris Hagel
-- Date: 2025-08-24
-- Dependencies: ai_models table must exist (from 002-tables.sql)
-- =====================================================

-- Add pricing information columns
-- These track the cost per 1000 tokens for accurate usage billing
ALTER TABLE ai_models 
ADD COLUMN IF NOT EXISTS input_cost_per_1k_tokens DECIMAL(10, 6) DEFAULT NULL;

ALTER TABLE ai_models 
ADD COLUMN IF NOT EXISTS output_cost_per_1k_tokens DECIMAL(10, 6) DEFAULT NULL;

ALTER TABLE ai_models 
ADD COLUMN IF NOT EXISTS cached_input_cost_per_1k_tokens DECIMAL(10, 6) DEFAULT NULL;

ALTER TABLE ai_models 
ADD COLUMN IF NOT EXISTS pricing_updated_at TIMESTAMP DEFAULT NULL;

-- Add performance characteristic columns
-- These help with provider selection and SLA management
ALTER TABLE ai_models 
ADD COLUMN IF NOT EXISTS average_latency_ms INTEGER DEFAULT NULL;

ALTER TABLE ai_models 
ADD COLUMN IF NOT EXISTS max_concurrency INTEGER DEFAULT 10;

ALTER TABLE ai_models 
ADD COLUMN IF NOT EXISTS supports_batching BOOLEAN DEFAULT FALSE;

-- Add enhanced capabilities as JSONB for structured capability tracking
-- This replaces the simple text array with rich capability metadata
ALTER TABLE ai_models 
ADD COLUMN IF NOT EXISTS nexus_capabilities JSONB DEFAULT NULL;

-- Add provider-specific metadata column
-- This stores provider-specific configuration, limits, and settings
ALTER TABLE ai_models 
ADD COLUMN IF NOT EXISTS provider_metadata JSONB DEFAULT '{}';

-- Create indexes for efficient querying
-- Index for pricing-based filtering (cost optimization)
CREATE INDEX IF NOT EXISTS idx_ai_models_pricing 
ON ai_models(provider, input_cost_per_1k_tokens, output_cost_per_1k_tokens) 
WHERE input_cost_per_1k_tokens IS NOT NULL;

-- Index for performance-based filtering (latency optimization)
CREATE INDEX IF NOT EXISTS idx_ai_models_performance 
ON ai_models(provider, average_latency_ms) 
WHERE average_latency_ms IS NOT NULL;

-- Index for capability-based filtering using JSONB operators
CREATE INDEX IF NOT EXISTS idx_ai_models_nexus_capabilities 
ON ai_models USING GIN(nexus_capabilities) 
WHERE nexus_capabilities IS NOT NULL;

-- Index for provider metadata queries
CREATE INDEX IF NOT EXISTS idx_ai_models_provider_metadata 
ON ai_models USING GIN(provider_metadata);

-- Index for concurrency and batching support
CREATE INDEX IF NOT EXISTS idx_ai_models_concurrency 
ON ai_models(provider, max_concurrency, supports_batching);

-- Update existing models with default pricing and capabilities based on known patterns
-- OpenAI GPT-4 models
UPDATE ai_models 
SET 
  input_cost_per_1k_tokens = 0.030,
  output_cost_per_1k_tokens = 0.060,
  average_latency_ms = 2000,
  max_concurrency = 5,
  supports_batching = TRUE,
  nexus_capabilities = '{
    "responsesAPI": true,
    "promptCaching": false,
    "contextCaching": false,
    "artifacts": false,
    "canvas": true,
    "webSearch": false,
    "codeInterpreter": true,
    "grounding": false,
    "codeExecution": true,
    "computerUse": false,
    "workspaceTools": false,
    "reasoning": true,
    "thinking": false
  }'::jsonb,
  provider_metadata = '{
    "max_context_length": 128000,
    "supports_function_calling": true,
    "supports_streaming": true
  }'::jsonb,
  pricing_updated_at = CURRENT_TIMESTAMP
WHERE provider = 'openai' AND model_id LIKE 'gpt-4%';

-- OpenAI GPT-3.5 models
UPDATE ai_models 
SET 
  input_cost_per_1k_tokens = 0.001,
  output_cost_per_1k_tokens = 0.002,
  average_latency_ms = 1000,
  max_concurrency = 10,
  supports_batching = TRUE,
  nexus_capabilities = '{
    "responsesAPI": true,
    "promptCaching": false,
    "contextCaching": false,
    "artifacts": false,
    "canvas": false,
    "webSearch": false,
    "codeInterpreter": false,
    "grounding": false,
    "codeExecution": false,
    "computerUse": false,
    "workspaceTools": false,
    "reasoning": false,
    "thinking": false
  }'::jsonb,
  provider_metadata = '{
    "max_context_length": 16384,
    "supports_function_calling": true,
    "supports_streaming": true
  }'::jsonb,
  pricing_updated_at = CURRENT_TIMESTAMP
WHERE provider = 'openai' AND model_id LIKE 'gpt-3.5%';

-- Anthropic Claude models
UPDATE ai_models 
SET 
  input_cost_per_1k_tokens = 0.003,
  output_cost_per_1k_tokens = 0.015,
  cached_input_cost_per_1k_tokens = 0.0003,
  average_latency_ms = 1500,
  max_concurrency = 8,
  supports_batching = FALSE,
  nexus_capabilities = '{
    "responsesAPI": false,
    "promptCaching": true,
    "contextCaching": false,
    "artifacts": true,
    "canvas": false,
    "webSearch": false,
    "codeInterpreter": false,
    "grounding": false,
    "codeExecution": false,
    "computerUse": true,
    "workspaceTools": false,
    "reasoning": true,
    "thinking": true
  }'::jsonb,
  provider_metadata = '{
    "max_context_length": 200000,
    "supports_function_calling": true,
    "supports_streaming": true,
    "prompt_caching_min_tokens": 1024
  }'::jsonb,
  pricing_updated_at = CURRENT_TIMESTAMP
WHERE provider = 'anthropic' AND model_id LIKE 'claude%';

-- Google Gemini models
UPDATE ai_models 
SET 
  input_cost_per_1k_tokens = 0.00125,
  output_cost_per_1k_tokens = 0.00375,
  average_latency_ms = 1800,
  max_concurrency = 10,
  supports_batching = TRUE,
  nexus_capabilities = '{
    "responsesAPI": false,
    "promptCaching": false,
    "contextCaching": true,
    "artifacts": false,
    "canvas": false,
    "webSearch": true,
    "codeInterpreter": true,
    "grounding": true,
    "codeExecution": true,
    "computerUse": false,
    "workspaceTools": true,
    "reasoning": true,
    "thinking": false
  }'::jsonb,
  provider_metadata = '{
    "max_context_length": 1000000,
    "supports_function_calling": true,
    "supports_streaming": true,
    "context_caching_enabled": true
  }'::jsonb,
  pricing_updated_at = CURRENT_TIMESTAMP
WHERE provider = 'google' AND model_id LIKE 'gemini%';

-- Azure OpenAI models (similar to OpenAI but different pricing structure)
UPDATE ai_models 
SET 
  input_cost_per_1k_tokens = 0.030,
  output_cost_per_1k_tokens = 0.060,
  average_latency_ms = 2200,
  max_concurrency = 5,
  supports_batching = TRUE,
  nexus_capabilities = '{
    "responsesAPI": true,
    "promptCaching": false,
    "contextCaching": false,
    "artifacts": false,
    "canvas": true,
    "webSearch": false,
    "codeInterpreter": true,
    "grounding": false,
    "codeExecution": true,
    "computerUse": false,
    "workspaceTools": false,
    "reasoning": true,
    "thinking": false
  }'::jsonb,
  provider_metadata = '{
    "max_context_length": 128000,
    "supports_function_calling": true,
    "supports_streaming": true,
    "deployment_type": "azure"
  }'::jsonb,
  pricing_updated_at = CURRENT_TIMESTAMP
WHERE provider = 'azure';

-- Set default values for any remaining models without pricing information
UPDATE ai_models 
SET 
  average_latency_ms = 2000,
  max_concurrency = 5,
  supports_batching = FALSE,
  nexus_capabilities = '{
    "responsesAPI": false,
    "promptCaching": false,
    "contextCaching": false,
    "artifacts": false,
    "canvas": false,
    "webSearch": false,
    "codeInterpreter": false,
    "grounding": false,
    "codeExecution": false,
    "computerUse": false,
    "workspaceTools": false,
    "reasoning": false,
    "thinking": false
  }'::jsonb,
  provider_metadata = '{
    "max_context_length": 4096,
    "supports_function_calling": false,
    "supports_streaming": true
  }'::jsonb
WHERE nexus_capabilities IS NULL;

-- Add comments to document the new columns
COMMENT ON COLUMN ai_models.input_cost_per_1k_tokens IS 
'Cost per 1000 input tokens in USD. Used for usage billing and cost optimization.';

COMMENT ON COLUMN ai_models.output_cost_per_1k_tokens IS 
'Cost per 1000 output tokens in USD. Used for usage billing and cost optimization.';

COMMENT ON COLUMN ai_models.cached_input_cost_per_1k_tokens IS 
'Cost per 1000 cached input tokens in USD. Used for prompt caching optimization (Anthropic).';

COMMENT ON COLUMN ai_models.pricing_updated_at IS 
'Timestamp when pricing information was last updated. Used for cache invalidation.';

COMMENT ON COLUMN ai_models.average_latency_ms IS 
'Average response latency in milliseconds. Used for performance optimization and user expectations.';

COMMENT ON COLUMN ai_models.max_concurrency IS 
'Maximum concurrent requests supported by the model/provider. Used for load balancing.';

COMMENT ON COLUMN ai_models.supports_batching IS 
'Whether the model supports batch processing for multiple requests. Used for efficiency optimization.';

COMMENT ON COLUMN ai_models.nexus_capabilities IS 
'Structured JSON object containing provider-specific capabilities like ResponsesAPI, prompt caching, artifacts, etc. Used for feature availability checks.';

COMMENT ON COLUMN ai_models.provider_metadata IS 
'Provider-specific metadata including context limits, function calling support, and other configuration. Used for provider-specific optimizations.';

-- Create a function to validate nexus_capabilities structure
-- This ensures consistency in capability definitions across providers
CREATE OR REPLACE FUNCTION validate_nexus_capabilities()
RETURNS TRIGGER AS '
BEGIN
    -- Validate that nexus_capabilities contains expected boolean fields
    IF NEW.nexus_capabilities IS NOT NULL THEN
        -- Check for required capability fields
        IF NOT (
            NEW.nexus_capabilities ? ''responsesAPI'' AND
            NEW.nexus_capabilities ? ''promptCaching'' AND
            NEW.nexus_capabilities ? ''contextCaching'' AND
            NEW.nexus_capabilities ? ''artifacts'' AND
            NEW.nexus_capabilities ? ''canvas'' AND
            NEW.nexus_capabilities ? ''webSearch'' AND
            NEW.nexus_capabilities ? ''codeInterpreter'' AND
            NEW.nexus_capabilities ? ''grounding'' AND
            NEW.nexus_capabilities ? ''codeExecution'' AND
            NEW.nexus_capabilities ? ''computerUse'' AND
            NEW.nexus_capabilities ? ''workspaceTools'' AND
            NEW.nexus_capabilities ? ''reasoning'' AND
            NEW.nexus_capabilities ? ''thinking''
        ) THEN
            RAISE EXCEPTION ''nexus_capabilities must contain all required capability fields'';
        END IF;
    END IF;
    RETURN NEW;
END;
' LANGUAGE plpgsql;

-- Apply validation trigger to ensure data consistency
DROP TRIGGER IF EXISTS validate_ai_models_nexus_capabilities ON ai_models;
CREATE TRIGGER validate_ai_models_nexus_capabilities 
  BEFORE INSERT OR UPDATE ON ai_models 
  FOR EACH ROW 
  WHEN (NEW.nexus_capabilities IS NOT NULL)
  EXECUTE FUNCTION validate_nexus_capabilities();

-- =====================================================
-- END OF MIGRATION
-- =====================================================