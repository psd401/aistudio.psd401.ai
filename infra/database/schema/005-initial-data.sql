-- 005-initial-data.sql: Insert initial data for the application

-- Insert default roles (matching production roles exactly)
INSERT INTO roles (name, description, is_system) VALUES 
('administrator', 'Full system access with all permissions', true),
('staff', 'Staff member with elevated permissions', true),
('student', 'Basic user access', true)
ON CONFLICT DO NOTHING;

-- Insert system settings
INSERT INTO settings (key, value, category, description, is_secret) VALUES
-- System configuration
('system.version', '1.0.0', 'system', 'Current system version', false),
('system.maintenance_mode', 'false', 'system', 'Whether the system is in maintenance mode', false),

-- Storage configuration
('AWS_REGION', 'us-east-1', 'storage', 'AWS region for S3 operations', false),
('S3_BUCKET', '', 'storage', 'AWS S3 bucket name for document storage', false),

-- AI Provider configuration (with placeholder values)
('AZURE_OPENAI_KEY', '', 'ai_providers', 'Azure OpenAI API key for GPT models', true),
('AZURE_OPENAI_ENDPOINT', '', 'ai_providers', 'Azure OpenAI endpoint URL', false),
('AZURE_OPENAI_RESOURCENAME', '', 'ai_providers', 'Azure OpenAI resource name', false),
('BEDROCK_ACCESS_KEY_ID', '', 'ai_providers', 'AWS Bedrock access key ID', true),
('BEDROCK_SECRET_ACCESS_KEY', '', 'ai_providers', 'AWS Bedrock secret access key', true),
('BEDROCK_REGION', 'us-west-2', 'ai_providers', 'AWS Bedrock region (e.g., us-east-1)', false),
('GOOGLE_API_KEY', '', 'ai_providers', 'Google AI API key for Gemini models', true),
('GOOGLE_VERTEX_PROJECT_ID', '', 'ai_providers', 'Google Cloud project ID for Vertex AI', false),
('GOOGLE_VERTEX_LOCATION', '', 'ai_providers', 'Google Cloud location for Vertex AI', false),
('GOOGLE_APPLICATION_CREDENTIALS', '', 'ai_providers', 'Path to Google Cloud service account credentials JSON', true),
('LATIMER_API_KEY', '', 'ai_providers', 'Latimer.ai API key', true),
('OPENAI_API_KEY', '', 'ai_providers', 'OpenAI API key for GPT models', true),

-- External services
('GITHUB_ISSUE_TOKEN', '', 'external_services', 'GitHub personal access token for creating issues', true)
ON CONFLICT (key) DO NOTHING;

-- Insert default AI models
INSERT INTO ai_models (name, model_id, provider, description, capabilities, max_tokens, active, chat_enabled) VALUES
('GPT-4o', 'gpt-4o', 'openai', 'OpenAI GPT-4 Optimized model with enhanced capabilities', 'Advanced reasoning, tool use, vision', 4096, true, true),
('GPT-4o Mini', 'gpt-4o-mini', 'openai', 'Smaller, faster version of GPT-4o', 'Fast responses, tool use, vision', 16385, true, true),
('Claude 3.5 Sonnet', 'claude-3-5-sonnet-20241022', 'anthropic', 'Latest Claude 3.5 Sonnet model', 'Advanced reasoning, tool use, vision', 8192, true, true),
('Claude 3.5 Haiku', 'claude-3-5-haiku-20241022', 'anthropic', 'Fast and efficient Claude model', 'Fast responses, basic reasoning', 8192, true, true),
('Gemini 1.5 Pro', 'gemini-1.5-pro', 'google', 'Google Gemini 1.5 Pro with large context window', 'Advanced reasoning, large context, vision', 8192, true, true),
('Gemini 1.5 Flash', 'gemini-1.5-flash', 'google', 'Fast Gemini model for quick responses', 'Fast responses, basic reasoning', 8192, true, true)
ON CONFLICT (model_id) DO UPDATE SET
    name = EXCLUDED.name,
    provider = EXCLUDED.provider,
    description = EXCLUDED.description,
    capabilities = EXCLUDED.capabilities,
    max_tokens = EXCLUDED.max_tokens,
    active = EXCLUDED.active,
    chat_enabled = EXCLUDED.chat_enabled,
    updated_at = CURRENT_TIMESTAMP;

-- Insert default tools
INSERT INTO tools (identifier, name, description, is_active) VALUES
('chat', 'Chat', 'AI Chat Interface', true),
('architect', 'Architect', 'Build custom AI tools and assistants', true),
('ideas', 'Ideas', 'Submit and track feature requests and ideas', true),
('admin', 'Admin', 'System administration tools', true)
ON CONFLICT (identifier) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    is_active = EXCLUDED.is_active,
    updated_at = CURRENT_TIMESTAMP;

-- Insert role-tool mappings
-- Administrator gets all tools
INSERT INTO role_tools (role_id, tool_id)
SELECT r.id, t.id
FROM roles r
CROSS JOIN tools t
WHERE r.name = 'administrator'
ON CONFLICT (role_id, tool_id) DO NOTHING;

-- Staff gets chat, architect, and ideas
INSERT INTO role_tools (role_id, tool_id)
SELECT r.id, t.id
FROM roles r
CROSS JOIN tools t
WHERE r.name = 'staff' 
  AND t.identifier IN ('chat', 'architect', 'ideas')
ON CONFLICT (role_id, tool_id) DO NOTHING;

-- Students get chat and ideas only
INSERT INTO role_tools (role_id, tool_id)
SELECT r.id, t.id
FROM roles r
CROSS JOIN tools t
WHERE r.name = 'student' 
  AND t.identifier IN ('chat', 'ideas')
ON CONFLICT (role_id, tool_id) DO NOTHING;

-- Insert navigation items
INSERT INTO navigation_items (label, link, icon, position, type, requires_role, is_active) VALUES
('Chat', '/chat', 'MessageSquare', 1, 'link', NULL, true),
('Architect', '/architect', 'Hammer', 2, 'link', 'staff', true),
('Ideas', '/ideas', 'Lightbulb', 3, 'link', NULL, true),
('Admin', '/admin', 'Settings', 4, 'link', 'administrator', true)
ON CONFLICT DO NOTHING;