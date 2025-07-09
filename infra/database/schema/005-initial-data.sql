-- 005-initial-data.sql: Insert essential system data
-- This file populates the database with required initial data

-- Insert default roles
INSERT INTO roles (name, description) VALUES
    ('administrator', 'Full system access with all permissions'),
    ('staff', 'Staff member with elevated permissions'),
    ('student', 'Basic user access')
ON CONFLICT DO NOTHING;

-- Insert default AI models
INSERT INTO ai_models (name, model_id, provider, active, input_price_per_1k, output_price_per_1k, max_tokens, supports_tools, supports_vision) VALUES
    ('GPT-4o', 'gpt-4o', 'openai', true, 0.0025, 0.01, 128000, true, true),
    ('GPT-4o Mini', 'gpt-4o-mini', 'openai', true, 0.00015, 0.0006, 128000, true, true),
    ('GPT-3.5 Turbo', 'gpt-3.5-turbo', 'openai', true, 0.0005, 0.0015, 16384, true, false),
    ('Claude 3.5 Sonnet', 'claude-3-5-sonnet-20241022', 'anthropic', true, 0.003, 0.015, 200000, true, true),
    ('Claude 3.5 Haiku', 'claude-3-5-haiku-20241022', 'anthropic', true, 0.001, 0.005, 200000, true, false),
    ('Claude 3 Haiku', 'claude-3-haiku-20240307', 'anthropic', true, 0.00025, 0.00125, 200000, true, false),
    ('Claude 3 Opus', 'claude-3-opus-20240229', 'anthropic', true, 0.015, 0.075, 200000, true, true),
    ('Gemini 1.5 Pro', 'gemini-1.5-pro', 'google', true, 0.00125, 0.005, 2097152, true, true),
    ('Gemini 1.5 Flash', 'gemini-1.5-flash', 'google', true, 0.000075, 0.0003, 1048576, true, true),
    ('Gemini 2.0 Flash', 'gemini-2.0-flash-exp', 'google', true, 0.0, 0.0, 1048576, true, true),
    ('Llama 3.2 Vision 11B', 'meta.llama3-2-11b-instruct-v1:0', 'bedrock', true, 0.00055, 0.00055, 128000, false, true),
    ('Llama 3.2 Vision 90B', 'meta.llama3-2-90b-instruct-v1:0', 'bedrock', true, 0.0022, 0.0022, 128000, false, true)
ON CONFLICT (model_id) DO UPDATE SET
    name = EXCLUDED.name,
    provider = EXCLUDED.provider,
    active = EXCLUDED.active,
    input_price_per_1k = EXCLUDED.input_price_per_1k,
    output_price_per_1k = EXCLUDED.output_price_per_1k,
    max_tokens = EXCLUDED.max_tokens,
    supports_tools = EXCLUDED.supports_tools,
    supports_vision = EXCLUDED.supports_vision;

-- Insert default system settings (without sensitive values)
-- Note: Actual API keys and secrets should be configured through environment variables or AWS Secrets Manager
INSERT INTO settings (key, value, category, description, is_sensitive) VALUES
    -- AI Provider Settings (placeholders only)
    ('OPENAI_API_KEY', '{"value": null}'::jsonb, 'ai_providers', 'OpenAI API key for GPT models', true),
    ('AZURE_OPENAI_ENDPOINT', '{"value": null}'::jsonb, 'ai_providers', 'Azure OpenAI endpoint URL', false),
    ('AZURE_OPENAI_KEY', '{"value": null}'::jsonb, 'ai_providers', 'Azure OpenAI API key for GPT models', true),
    ('AZURE_OPENAI_RESOURCENAME', '{"value": null}'::jsonb, 'ai_providers', 'Azure OpenAI resource name', false),
    ('GOOGLE_API_KEY', '{"value": null}'::jsonb, 'ai_providers', 'Google AI API key for Gemini models', true),
    ('GOOGLE_APPLICATION_CREDENTIALS', '{"value": null}'::jsonb, 'ai_providers', 'Path to Google Cloud service account credentials JSON', true),
    ('GOOGLE_VERTEX_PROJECT_ID', '{"value": null}'::jsonb, 'ai_providers', 'Google Cloud project ID for Vertex AI', false),
    ('GOOGLE_VERTEX_LOCATION', '{"value": null}'::jsonb, 'ai_providers', 'Google Cloud location for Vertex AI', false),
    ('BEDROCK_ACCESS_KEY_ID', '{"value": null}'::jsonb, 'ai_providers', 'AWS Bedrock access key ID', true),
    ('BEDROCK_SECRET_ACCESS_KEY', '{"value": null}'::jsonb, 'ai_providers', 'AWS Bedrock secret access key', true),
    ('BEDROCK_REGION', '{"value": "us-west-2"}'::jsonb, 'ai_providers', 'AWS Bedrock region (e.g., us-east-1)', false),
    ('LATIMER_API_KEY', '{"value": null}'::jsonb, 'ai_providers', 'Latimer.ai API key', true),
    
    -- External Services Settings
    ('GITHUB_ISSUE_TOKEN', '{"value": null}'::jsonb, 'external_services', 'GitHub personal access token for creating issues', true),
    
    -- Storage Settings
    ('AWS_REGION', '{"value": "us-east-1"}'::jsonb, 'storage', 'AWS region for S3 operations', false),
    ('S3_BUCKET', '{"value": null}'::jsonb, 'storage', 'AWS S3 bucket name for document storage', false)
ON CONFLICT (key) DO NOTHING;

-- Insert default tools
INSERT INTO tools (identifier, name, description, icon, is_active) VALUES
    ('chat', 'AI Chat', 'Interactive AI chat assistant', 'MessageSquare', true),
    ('assistant-architect', 'Assistant Architect', 'Create and manage custom AI assistants', 'Bot', true),
    ('ideas', 'Ideas Board', 'Submit and vote on feature ideas', 'Lightbulb', true),
    ('admin', 'Administration', 'System administration tools', 'Settings', true)
ON CONFLICT (identifier) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    icon = EXCLUDED.icon,
    is_active = EXCLUDED.is_active;

-- Insert role-tool mappings (administrators get all tools)
INSERT INTO role_tools (role_id, tool_id)
SELECT r.id, t.id 
FROM roles r 
CROSS JOIN tools t 
WHERE r.name = 'administrator'
ON CONFLICT DO NOTHING;

-- Staff get most tools except admin
INSERT INTO role_tools (role_id, tool_id)
SELECT r.id, t.id 
FROM roles r 
CROSS JOIN tools t 
WHERE r.name = 'staff' AND t.identifier != 'admin'
ON CONFLICT DO NOTHING;

-- Students get basic tools
INSERT INTO role_tools (role_id, tool_id)
SELECT r.id, t.id 
FROM roles r 
CROSS JOIN tools t 
WHERE r.name = 'student' AND t.identifier IN ('chat', 'ideas')
ON CONFLICT DO NOTHING;