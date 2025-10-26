-- =====================================================
-- Migration: 040-latimer-ai-models.sql
-- Description: Add Latimer AI models with full capabilities and pricing metadata
-- Author: Kris Hagel
-- Date: 2025-10-26
-- Dependencies: ai_models table must exist (from 002-tables.sql)
-- Related: Issue #430 - Latimer AI custom provider integration
-- =====================================================

-- Insert Latimer AI model (simple format matching 005-initial-data.sql pattern)
INSERT INTO ai_models (name, model_id, provider, description, capabilities, max_tokens, active, chat_enabled) VALUES
('Latimer v1', 'latimer-v1', 'latimer', 'Latimer AI standard model - OpenAI-compatible endpoint', 'Reasoning, streaming, function calling', 8192, true, true)
ON CONFLICT (model_id) DO UPDATE SET
  name = EXCLUDED.name,
  provider = EXCLUDED.provider,
  description = EXCLUDED.description,
  capabilities = EXCLUDED.capabilities,
  max_tokens = EXCLUDED.max_tokens,
  active = EXCLUDED.active,
  chat_enabled = EXCLUDED.chat_enabled,
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
