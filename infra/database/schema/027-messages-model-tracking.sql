-- 027-messages-model-tracking.sql: Add model tracking and token usage to messages table
-- This migration adds columns to track which AI model was used for each message,
-- reasoning content for models that support it, and token usage statistics

-- Add model_id column to track which AI model generated the message
ALTER TABLE messages ADD COLUMN IF NOT EXISTS model_id INTEGER;

-- Add reasoning_content column for models that provide reasoning chains
ALTER TABLE messages ADD COLUMN IF NOT EXISTS reasoning_content TEXT;

-- Add token_usage column to track token consumption
ALTER TABLE messages ADD COLUMN IF NOT EXISTS token_usage JSONB;

-- Add foreign key constraint to ai_models table
ALTER TABLE messages ADD CONSTRAINT fk_messages_model_id 
  FOREIGN KEY (model_id) REFERENCES ai_models(id) ON DELETE SET NULL;

-- Create index for faster queries by model
CREATE INDEX IF NOT EXISTS idx_messages_model_id ON messages(model_id);