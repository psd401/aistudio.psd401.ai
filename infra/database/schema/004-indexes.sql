-- 004-indexes.sql: Create performance indexes
-- This file creates indexes to optimize query performance

-- Users table indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_cognito_sub ON users(cognito_sub);

-- User roles indexes
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role_id ON user_roles(role_id);

-- Role tools indexes
CREATE INDEX IF NOT EXISTS idx_role_tools_role_id ON role_tools(role_id);
CREATE INDEX IF NOT EXISTS idx_role_tools_tool_id ON role_tools(tool_id);

-- AI models indexes
CREATE INDEX IF NOT EXISTS idx_ai_models_model_id ON ai_models(model_id);
CREATE INDEX IF NOT EXISTS idx_ai_models_active ON ai_models(active);

-- Tools indexes
CREATE INDEX IF NOT EXISTS idx_tools_identifier ON tools(identifier);
CREATE INDEX IF NOT EXISTS idx_tools_is_active ON tools(is_active);

-- Navigation items indexes
CREATE INDEX IF NOT EXISTS idx_navigation_items_parent_id ON navigation_items(parent_id);
CREATE INDEX IF NOT EXISTS idx_navigation_items_position ON navigation_items(position);
CREATE INDEX IF NOT EXISTS idx_navigation_items_is_active ON navigation_items(is_active);

-- Conversations indexes
CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_created_at ON conversations(created_at);
CREATE INDEX IF NOT EXISTS idx_conversations_source ON conversations(source);

-- Messages indexes
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);

-- Documents indexes
CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id);
CREATE INDEX IF NOT EXISTS idx_documents_conversation_id ON documents(conversation_id);

-- Document chunks indexes
CREATE INDEX IF NOT EXISTS idx_document_chunks_document_id ON document_chunks(document_id);

-- Jobs indexes
CREATE INDEX IF NOT EXISTS idx_jobs_user_id ON jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at);

-- Ideas indexes
CREATE INDEX IF NOT EXISTS idx_ideas_user_id ON ideas(user_id);
CREATE INDEX IF NOT EXISTS idx_ideas_created_at ON ideas(created_at);

-- Settings indexes
CREATE INDEX IF NOT EXISTS idx_settings_key ON settings(key);
CREATE INDEX IF NOT EXISTS idx_settings_category ON settings(category);