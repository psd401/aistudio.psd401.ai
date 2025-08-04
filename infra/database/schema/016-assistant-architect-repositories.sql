-- Migration: Add repository support to Assistant Architect
-- Description: Adds repository_ids column to chain_prompts table to enable knowledge repository integration
-- Date: 2025-08-03

-- Add repository_ids column to chain_prompts table
ALTER TABLE chain_prompts 
ADD COLUMN IF NOT EXISTS repository_ids JSONB DEFAULT '[]'::jsonb;

-- Add GIN index for efficient JSONB queries
CREATE INDEX IF NOT EXISTS idx_chain_prompts_repository_ids 
ON chain_prompts USING gin(repository_ids);

-- Add comment for documentation
COMMENT ON COLUMN chain_prompts.repository_ids IS 'Array of repository IDs that this prompt can access for knowledge retrieval';