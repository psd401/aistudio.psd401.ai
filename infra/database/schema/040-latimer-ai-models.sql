-- =====================================================
-- Migration: 040-latimer-ai-models.sql
-- Description: Add Latimer AI models with full capabilities and pricing metadata
-- Author: Kris Hagel
-- Date: 2025-10-26
-- Dependencies: ai_models table must exist (from 002-tables.sql)
-- Related: Issue #430 - Latimer AI custom provider integration
-- =====================================================

-- Insert Latimer AI model with all fields in one statement
INSERT INTO ai_models (
  name,
  model_id,
  provider,
  description,
  capabilities,
  max_tokens,
  active,
  chat_enabled,
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
  2000,
  5,
  false,
  '{"responsesAPI": false, "promptCaching": false, "contextCaching": false, "artifacts": false, "canvas": false, "webSearch": false, "codeInterpreter": false, "grounding": false, "codeExecution": false, "computerUse": false, "workspaceTools": false, "reasoning": false, "thinking": false}'::jsonb,
  '{"max_context_length": 8192, "supports_function_calling": true, "supports_streaming": true, "api_endpoint": "https://api.latimer.ai/v1", "openai_compatible": true}'::jsonb
) ON CONFLICT (model_id) DO NOTHING;

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
