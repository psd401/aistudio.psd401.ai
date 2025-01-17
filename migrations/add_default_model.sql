-- Insert Claude 3 Sonnet as default model
INSERT INTO ai_models (name, provider, model_id, description, capabilities, active, created_at, updated_at)
VALUES (
    'Claude 3 Sonnet',
    'amazon-bedrock',
    'anthropic.claude-3-sonnet-20240229-v1:0',
    'Latest Claude 3 model from Anthropic, available through Amazon Bedrock',
    '{"chat": true, "completion": true}',
    true,
    NOW(),
    NOW()
)
ON CONFLICT (model_id) DO UPDATE
SET 
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    capabilities = EXCLUDED.capabilities,
    active = EXCLUDED.active,
    updated_at = NOW(); 