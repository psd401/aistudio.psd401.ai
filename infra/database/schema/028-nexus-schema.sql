-- =====================================================
-- Migration: 028-nexus-schema.sql
-- Description: Complete Nexus database schema for chat application
-- Author: Kris Hagel
-- Date: 2025-08-23
-- Dependencies: users table must exist
-- =====================================================

-- =====================================================
-- CONVERSATION MANAGEMENT
-- =====================================================

-- Main conversations table (merged from #150 and #152)
CREATE TABLE IF NOT EXISTS nexus_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Provider integration (from #150)
  provider VARCHAR(50) NOT NULL CHECK (provider IN ('openai', 'anthropic', 'google', 'azure', 'local')),
  external_id VARCHAR(255), -- Provider's conversation/response ID
  cache_key VARCHAR(255),    -- Cache reference for provider
  
  -- Basic metadata
  title VARCHAR(500),
  model_used VARCHAR(100),
  
  -- Organization (from #149)
  folder_id UUID, -- Will reference nexus_folders
  
  -- Statistics
  message_count INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  last_message_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Status flags
  is_archived BOOLEAN DEFAULT FALSE,
  is_pinned BOOLEAN DEFAULT FALSE,
  
  -- Flexible metadata
  metadata JSONB DEFAULT '{}',
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Constraints
  UNIQUE(provider, external_id) -- Note: Allows multiple NULL external_id per provider (intended for local conversations)
);

-- Indexes for conversations
CREATE INDEX IF NOT EXISTS idx_nexus_conv_user ON nexus_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_nexus_conv_user_updated ON nexus_conversations(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_nexus_conv_user_folder ON nexus_conversations(user_id, folder_id);
CREATE INDEX IF NOT EXISTS idx_nexus_conv_external ON nexus_conversations(provider, external_id);
CREATE INDEX IF NOT EXISTS idx_nexus_conv_cache ON nexus_conversations(cache_key) WHERE cache_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_nexus_conv_archived ON nexus_conversations(user_id, is_archived);

-- =====================================================
-- FOLDER ORGANIZATION (from #149)
-- =====================================================

CREATE TABLE IF NOT EXISTS nexus_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES nexus_folders(id) ON DELETE CASCADE,
  
  -- Folder properties
  name VARCHAR(255) NOT NULL,
  color VARCHAR(7) DEFAULT '#6B7280' CHECK (color ~ '^#[0-9A-Fa-f]{6}$'),
  icon VARCHAR(50) DEFAULT 'folder',
  
  -- Organization
  sort_order INTEGER DEFAULT 0,
  is_expanded BOOLEAN DEFAULT FALSE,
  
  -- Flexible settings
  settings JSONB DEFAULT '{}',
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Constraints
  CHECK (id != parent_id) -- Prevent self-referencing
);

-- Add foreign key for folder_id in conversations
-- Note: This will error if constraint already exists, but that's handled by the migration runner
ALTER TABLE nexus_conversations 
  DROP CONSTRAINT IF EXISTS fk_conversation_folder;
ALTER TABLE nexus_conversations 
  ADD CONSTRAINT fk_conversation_folder 
  FOREIGN KEY (folder_id) REFERENCES nexus_folders(id) ON DELETE SET NULL;

-- Indexes for folders
CREATE INDEX IF NOT EXISTS idx_nexus_folders_user ON nexus_folders(user_id);
CREATE INDEX IF NOT EXISTS idx_nexus_folders_parent ON nexus_folders(parent_id);
CREATE INDEX IF NOT EXISTS idx_nexus_folders_user_sort ON nexus_folders(user_id, sort_order);

-- Unique constraints for folder names (using partial indexes to handle NULL parent_id)
CREATE UNIQUE INDEX IF NOT EXISTS idx_nexus_folders_unique_root_name 
  ON nexus_folders(user_id, name) WHERE parent_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_nexus_folders_unique_child_name 
  ON nexus_folders(user_id, parent_id, name) WHERE parent_id IS NOT NULL;

-- =====================================================
-- CONVERSATION ORGANIZATION (from #149)
-- =====================================================

CREATE TABLE IF NOT EXISTS nexus_conversation_folders (
  conversation_id UUID NOT NULL REFERENCES nexus_conversations(id) ON DELETE CASCADE,
  folder_id UUID NOT NULL REFERENCES nexus_folders(id) ON DELETE CASCADE,
  
  -- Organization within folder
  position INTEGER DEFAULT 0,
  pinned BOOLEAN DEFAULT FALSE,
  archived_at TIMESTAMP,
  
  PRIMARY KEY (conversation_id, folder_id)
);

CREATE INDEX IF NOT EXISTS idx_nexus_conv_folders_folder ON nexus_conversation_folders(folder_id, position);

-- =====================================================
-- USER PREFERENCES (from #149)
-- =====================================================

CREATE TABLE IF NOT EXISTS nexus_user_preferences (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  
  -- UI preferences
  expanded_folders JSONB DEFAULT '[]',
  panel_width INTEGER DEFAULT 400,
  sort_preference VARCHAR(50) DEFAULT 'recent',
  view_mode VARCHAR(50) DEFAULT 'tree',
  
  -- General settings
  settings JSONB DEFAULT '{}',
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- CACHING & EVENT SOURCING (from #150)
-- =====================================================

CREATE TABLE IF NOT EXISTS nexus_conversation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES nexus_conversations(id) ON DELETE CASCADE,
  event_type VARCHAR(50) NOT NULL,
  event_data JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_nexus_events_conversation ON nexus_conversation_events(conversation_id, created_at DESC);

CREATE TABLE IF NOT EXISTS nexus_cache_entries (
  cache_key VARCHAR(255) PRIMARY KEY,
  provider VARCHAR(50) NOT NULL,
  conversation_id UUID REFERENCES nexus_conversations(id) ON DELETE CASCADE,
  ttl INTEGER NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  hit_count INTEGER DEFAULT 0,
  byte_size INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_nexus_cache_expires ON nexus_cache_entries(expires_at);
CREATE INDEX IF NOT EXISTS idx_nexus_cache_conversation ON nexus_cache_entries(conversation_id);

-- =====================================================
-- MCP INTEGRATION (from #151)
-- =====================================================

CREATE TABLE IF NOT EXISTS nexus_mcp_servers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  url TEXT NOT NULL,
  transport VARCHAR(50) NOT NULL CHECK (transport IN ('stdio', 'http', 'websocket')),
  auth_type VARCHAR(50) NOT NULL CHECK (auth_type IN ('api_key', 'oauth', 'jwt', 'none')),
  credentials_key VARCHAR(255), -- AWS Secrets Manager key
  allowed_users INTEGER[], -- Array of user IDs
  max_connections INTEGER DEFAULT 10 CHECK (max_connections > 0),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(name)
);

CREATE INDEX IF NOT EXISTS idx_nexus_mcp_transport ON nexus_mcp_servers(transport);

CREATE TABLE IF NOT EXISTS nexus_mcp_capabilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID NOT NULL REFERENCES nexus_mcp_servers(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL CHECK (type IN ('tool', 'resource', 'prompt')),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  input_schema JSONB NOT NULL,
  output_schema JSONB,
  sandbox_level VARCHAR(50) DEFAULT 'standard' CHECK (sandbox_level IN ('standard', 'strict', 'none')),
  rate_limit INTEGER DEFAULT 10,
  
  UNIQUE(server_id, name)
);

CREATE INDEX IF NOT EXISTS idx_nexus_mcp_capabilities ON nexus_mcp_capabilities(server_id, type);

CREATE TABLE IF NOT EXISTS nexus_mcp_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  server_id UUID NOT NULL REFERENCES nexus_mcp_servers(id) ON DELETE CASCADE,
  tool_name VARCHAR(255) NOT NULL,
  input JSONB,
  output JSONB,
  error TEXT,
  duration_ms INTEGER,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_nexus_mcp_audit_user ON nexus_mcp_audit_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_nexus_mcp_audit_server ON nexus_mcp_audit_logs(server_id, created_at DESC);

CREATE TABLE IF NOT EXISTS nexus_mcp_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID NOT NULL REFERENCES nexus_mcp_servers(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(50) NOT NULL CHECK (status IN ('connected', 'disconnected', 'error', 'connecting')),
  last_health_check TIMESTAMP,
  latency_ms INTEGER,
  error_count INTEGER DEFAULT 0,
  success_count INTEGER DEFAULT 0,
  circuit_state VARCHAR(50) DEFAULT 'closed' CHECK (circuit_state IN ('open', 'closed', 'half_open')),
  last_error TEXT,
  last_connected_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(server_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_nexus_mcp_conn_status ON nexus_mcp_connections(server_id, status);
CREATE INDEX IF NOT EXISTS idx_nexus_mcp_conn_user ON nexus_mcp_connections(user_id, status);

-- =====================================================
-- TEMPLATES & SHARING (from #152)
-- =====================================================

CREATE TABLE IF NOT EXISTS nexus_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  prompt TEXT NOT NULL,
  variables JSONB DEFAULT '[]',
  is_public BOOLEAN DEFAULT FALSE,
  usage_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_nexus_templates_public ON nexus_templates(is_public, usage_count DESC) WHERE is_public = TRUE;
CREATE INDEX IF NOT EXISTS idx_nexus_templates_user ON nexus_templates(user_id);

CREATE TABLE IF NOT EXISTS nexus_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES nexus_conversations(id) ON DELETE CASCADE,
  shared_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  share_token VARCHAR(255) UNIQUE NOT NULL,
  expires_at TIMESTAMP,
  view_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_nexus_shares_token ON nexus_shares(share_token);
CREATE INDEX IF NOT EXISTS idx_nexus_shares_expires ON nexus_shares(expires_at) WHERE expires_at IS NOT NULL;

-- =====================================================
-- TRIGGERS AND FUNCTIONS
-- =====================================================

-- NOTE: AWS RDS Data API does not support DO blocks or $$ syntax
-- Function and trigger creation must use standard SQL syntax only
-- The update_updated_at_column function should already exist from initial setup

-- Check if the function exists, and only create if it doesn't
-- This is done in a way that's compatible with RDS Data API
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS '
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
' LANGUAGE plpgsql;

-- Apply update trigger to all tables with updated_at
-- Using IF NOT EXISTS equivalent approach for triggers
DROP TRIGGER IF EXISTS update_nexus_conversations_updated_at ON nexus_conversations;
CREATE TRIGGER update_nexus_conversations_updated_at 
  BEFORE UPDATE ON nexus_conversations 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_nexus_folders_updated_at ON nexus_folders;
CREATE TRIGGER update_nexus_folders_updated_at 
  BEFORE UPDATE ON nexus_folders 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_nexus_user_preferences_updated_at ON nexus_user_preferences;
CREATE TRIGGER update_nexus_user_preferences_updated_at 
  BEFORE UPDATE ON nexus_user_preferences 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_nexus_mcp_servers_updated_at ON nexus_mcp_servers;
CREATE TRIGGER update_nexus_mcp_servers_updated_at 
  BEFORE UPDATE ON nexus_mcp_servers 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_nexus_mcp_connections_updated_at ON nexus_mcp_connections;
CREATE TRIGGER update_nexus_mcp_connections_updated_at 
  BEFORE UPDATE ON nexus_mcp_connections 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_nexus_templates_updated_at ON nexus_templates;
CREATE TRIGGER update_nexus_templates_updated_at 
  BEFORE UPDATE ON nexus_templates 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- END OF MIGRATION
-- =====================================================