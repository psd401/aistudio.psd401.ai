-- =====================================================
-- Migration: 040-latimer-ai-models.sql
-- Description: Add Latimer AI models with full capabilities and pricing metadata
-- Author: Kris Hagel
-- Date: 2025-10-26
-- Dependencies: ai_models table must exist (from 002-tables.sql)
-- Related: Issue #430 - Latimer AI custom provider integration
-- =====================================================

-- Insert Latimer AI models
-- Note: Using actual table schema from 002-tables.sql and 005-initial-data.sql
-- Capabilities field is text, not structured JSON fields

INSERT INTO ai_models (
  name,
  model_id,
  provider,
  description,
  capabilities,
  max_tokens,
  active,
  chat_enabled,
  input_cost_per_1k_tokens,
  output_cost_per_1k_tokens,
  average_latency_ms,
  max_concurrency,
  supports_batching,
  nexus_capabilities,
  provider_metadata
) VALUES (
  'Latimer v1',
  'latimer-v1',
  'latimer',
  'Latimer AI standard model - OpenAI-compatible endpoint',
  'Reasoning, streaming, function calling',
  8192,
  true,
  true,
  NULL, -- Pricing to be confirmed
  NULL, -- Pricing to be confirmed
  2000,
  5,
  false,
  '{
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
  '{
    "max_context_length": 8192,
    "supports_function_calling": true,
    "supports_streaming": true,
    "api_endpoint": "https://api.latimer.ai/v1",
    "openai_compatible": true
  }'::jsonb
) ON CONFLICT (model_id) DO UPDATE SET
  name = EXCLUDED.name,
  provider = EXCLUDED.provider,
  description = EXCLUDED.description,
  capabilities = EXCLUDED.capabilities,
  max_tokens = EXCLUDED.max_tokens,
  active = EXCLUDED.active,
  chat_enabled = EXCLUDED.chat_enabled,
  input_cost_per_1k_tokens = EXCLUDED.input_cost_per_1k_tokens,
  output_cost_per_1k_tokens = EXCLUDED.output_cost_per_1k_tokens,
  average_latency_ms = EXCLUDED.average_latency_ms,
  max_concurrency = EXCLUDED.max_concurrency,
  supports_batching = EXCLUDED.supports_batching,
  nexus_capabilities = EXCLUDED.nexus_capabilities,
  provider_metadata = EXCLUDED.provider_metadata,
  updated_at = CURRENT_TIMESTAMP;

-- Add comment to track migration
COMMENT ON TABLE ai_models IS 'AI models table - Last updated with Latimer AI integration (migration 040)';

-- =====================================================
-- VERIFICATION QUERIES (for manual testing)
-- =====================================================
-- SELECT provider, model_id, display_name, is_active
-- FROM ai_models
-- WHERE provider = 'latimer'
-- ORDER BY model_id;

-- SELECT provider, COUNT(*) as model_count
-- FROM ai_models
-- WHERE is_active = true
-- GROUP BY provider
-- ORDER BY provider;
-- =====================================================
-- END OF MIGRATION
-- =====================================================
