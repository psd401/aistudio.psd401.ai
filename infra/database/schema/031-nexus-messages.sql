-- =====================================================
-- Migration: 031-nexus-messages.sql
-- Description: Create nexus_messages table for AI SDK compatible message storage
-- Author: Kris Hagel
-- Date: 2025-08-24
-- Dependencies: nexus_conversations table must exist (028-nexus-schema.sql)
-- =====================================================

-- Create nexus_messages table for local message storage
-- This follows AI SDK patterns for message persistence
CREATE TABLE IF NOT EXISTS nexus_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES nexus_conversations(id) ON DELETE CASCADE,
  
  -- Message properties matching AI SDK UIMessage format
  role VARCHAR(50) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT, -- Plain text content for simple messages
  parts JSONB, -- Structured content parts for AI SDK v5 (text, image, etc.)
  
  -- Model information
  model_id INTEGER REFERENCES ai_models(id),
  
  -- Assistant-specific fields
  reasoning_content TEXT, -- For o1 models and similar
  token_usage JSONB, -- Token counts and usage statistics
  finish_reason VARCHAR(50), -- stop, length, content_filter, etc.
  
  -- Flexible metadata
  metadata JSONB DEFAULT '{}',
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_nexus_messages_conversation ON nexus_messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_nexus_messages_role ON nexus_messages(conversation_id, role);

-- Add comment to table
COMMENT ON TABLE nexus_messages IS 'Stores messages for Nexus conversations following AI SDK patterns';
COMMENT ON COLUMN nexus_messages.parts IS 'AI SDK v5 message parts array - [{type: "text", text: "..."}, {type: "image", image: "..."}]';
COMMENT ON COLUMN nexus_messages.token_usage IS 'Token usage stats - {promptTokens, completionTokens, totalTokens}';