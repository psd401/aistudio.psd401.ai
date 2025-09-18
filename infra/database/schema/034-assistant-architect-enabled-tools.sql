-- Migration: Add enabled_tools support to Assistant Architect chain prompts
-- Purpose: Allow prompts to specify which tools they can use during execution
-- Part of Epic #250 - Assistant Architect Enhanced Tool Management

-- Add enabled_tools column to chain_prompts table
ALTER TABLE chain_prompts
ADD COLUMN IF NOT EXISTS enabled_tools JSONB DEFAULT '[]'::jsonb;

-- Add column comment for documentation
COMMENT ON COLUMN chain_prompts.enabled_tools IS
'JSON array of enabled tool names for this prompt. Example: ["webSearch", "codeInterpreter", "fileSystem"]';

-- Create index for efficient tool filtering
CREATE INDEX IF NOT EXISTS idx_chain_prompts_enabled_tools
ON chain_prompts USING GIN (enabled_tools);

COMMENT ON INDEX idx_chain_prompts_enabled_tools IS
'GIN index for efficient filtering of prompts by enabled tools';