-- =====================================================
-- Migration: 032-remove-nexus-provider-constraint.sql
-- Description: Remove the restrictive provider check constraint from nexus_conversations
-- Author: Kris Hagel
-- Date: 2025-08-24
-- Reason: Provider list should not be hardcoded in database constraints
-- =====================================================

-- Drop the restrictive provider check constraint
ALTER TABLE nexus_conversations 
DROP CONSTRAINT IF EXISTS nexus_conversations_provider_check;

-- Add comment explaining why we don't restrict providers
COMMENT ON COLUMN nexus_conversations.provider IS 'Provider name (e.g., openai, anthropic, amazon-bedrock, google, etc.) - No restrictions to allow for new providers';