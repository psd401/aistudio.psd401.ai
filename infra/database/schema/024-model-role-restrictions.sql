-- Migration 024: Add role-based access control to AI models
-- This migration adds support for restricting certain AI models to specific user roles

-- Add allowed_roles column to ai_models table
-- This column will store a JSON array of role names that have access to the model
-- NULL means the model is accessible to all roles
ALTER TABLE ai_models 
ADD COLUMN IF NOT EXISTS allowed_roles JSONB DEFAULT NULL;

-- Add index for efficient role-based filtering
CREATE INDEX IF NOT EXISTS idx_ai_models_allowed_roles 
ON ai_models USING GIN(allowed_roles);

-- Add comment to explain the column
COMMENT ON COLUMN ai_models.allowed_roles IS 
'JSON array of role names that have access to this model. NULL means accessible to all roles. Example: ["administrator", "staff"]';

-- Ensure capabilities column is properly formatted as JSON
-- This standardizes the format for capability-based filtering
-- Using safe validation to prevent SQL injection
UPDATE ai_models 
SET capabilities = 
  CASE 
    WHEN capabilities IS NULL OR capabilities::text = '' THEN NULL
    -- Validate JSON array structure before casting
    WHEN capabilities::text ~ '^\[.*\]$' THEN 
      CASE 
        WHEN jsonb_typeof(capabilities::jsonb) = 'array' THEN capabilities::jsonb::text
        ELSE '[]'::text -- Default to empty array if not valid array
      END
    -- Handle comma-separated values with strict validation
    WHEN capabilities::text ~ '^[a-zA-Z0-9_\-]+(,[a-zA-Z0-9_\-]+)*$' THEN 
      to_jsonb(string_to_array(trim(capabilities::text), ','))::text
    ELSE '[]'::text -- Default to empty array for invalid data
  END
WHERE capabilities IS NOT NULL;

-- Add index for efficient capability-based filtering
CREATE INDEX IF NOT EXISTS idx_ai_models_capabilities 
ON ai_models USING GIN((capabilities::jsonb));

-- Add comment to explain capabilities format
COMMENT ON COLUMN ai_models.capabilities IS 
'JSON array of model capabilities. Example: ["chat", "image_generation", "code_interpreter", "web_search"]';

-- Example: Set some models as admin-only (commented out, for reference)
-- UPDATE ai_models 
-- SET allowed_roles = '["administrator"]'::jsonb
-- WHERE model_id IN ('gpt-4-turbo', 'claude-3-opus');

-- Example: Set some models for staff and above (commented out, for reference)  
-- UPDATE ai_models
-- SET allowed_roles = '["administrator", "staff"]'::jsonb  
-- WHERE model_id IN ('gpt-4', 'claude-3-sonnet');