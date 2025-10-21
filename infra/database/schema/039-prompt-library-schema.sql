-- 039-prompt-library-schema.sql
-- Database schema for Prompt Library feature (Issue #387)
CREATE TABLE IF NOT EXISTS prompt_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  description TEXT,
  visibility VARCHAR(20) NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'public')),
  moderation_status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (moderation_status IN ('pending', 'approved', 'rejected')),
  moderated_by INTEGER REFERENCES users(id),
  moderated_at TIMESTAMP,
  moderation_notes TEXT,
  source_message_id UUID REFERENCES nexus_messages(id) ON DELETE SET NULL,
  source_conversation_id UUID REFERENCES nexus_conversations(id) ON DELETE SET NULL,
  view_count INTEGER NOT NULL DEFAULT 0,
  use_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP
);
CREATE TABLE IF NOT EXISTS prompt_tags (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) NOT NULL UNIQUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS prompt_library_tags (
  prompt_id UUID NOT NULL REFERENCES prompt_library(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES prompt_tags(id) ON DELETE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (prompt_id, tag_id)
);
CREATE TABLE IF NOT EXISTS prompt_usage_events (
  id SERIAL PRIMARY KEY,
  prompt_id UUID NOT NULL REFERENCES prompt_library(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type VARCHAR(20) NOT NULL CHECK (event_type IN ('view', 'use', 'share')),
  conversation_id UUID REFERENCES nexus_conversations(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_prompt_library_user
ON prompt_library(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_prompt_library_visibility
ON prompt_library(visibility, moderation_status);
CREATE INDEX IF NOT EXISTS idx_prompt_tags_name
ON prompt_tags(name);
CREATE INDEX IF NOT EXISTS idx_prompt_library_tags_prompt
ON prompt_library_tags(prompt_id);
CREATE INDEX IF NOT EXISTS idx_prompt_library_tags_tag
ON prompt_library_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_prompt_usage_prompt
ON prompt_usage_events(prompt_id, created_at);
CREATE INDEX IF NOT EXISTS idx_prompt_usage_user
ON prompt_usage_events(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_prompt_usage_type
ON prompt_usage_events(event_type);
