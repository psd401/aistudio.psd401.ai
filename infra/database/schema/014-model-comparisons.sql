-- 014-model-comparisons.sql: Create model comparisons table for side-by-side AI response analysis
-- Migration file - only runs on existing databases (not fresh installs)

-- Model comparisons table: Store comparison history between two AI models
CREATE TABLE IF NOT EXISTS model_comparisons (
    id BIGSERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    prompt TEXT NOT NULL,
    model1_id INTEGER REFERENCES ai_models(id) ON DELETE SET NULL,
    model2_id INTEGER REFERENCES ai_models(id) ON DELETE SET NULL,
    response1 TEXT,
    response2 TEXT,
    model1_name TEXT, -- Denormalized for historical reference if model is deleted
    model2_name TEXT, -- Denormalized for historical reference if model is deleted
    metadata JSONB DEFAULT '{}',
    execution_time_ms1 INTEGER, -- Time taken for model 1 response
    execution_time_ms2 INTEGER, -- Time taken for model 2 response
    tokens_used1 INTEGER, -- Tokens used by model 1
    tokens_used2 INTEGER, -- Tokens used by model 2
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_model_comparisons_user_id ON model_comparisons(user_id);
CREATE INDEX IF NOT EXISTS idx_model_comparisons_created_at ON model_comparisons(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_model_comparisons_models ON model_comparisons(model1_id, model2_id);

-- Add comment for documentation
COMMENT ON TABLE model_comparisons IS 'Stores side-by-side AI model comparison history for analysis';
COMMENT ON COLUMN model_comparisons.metadata IS 'JSON metadata including user preferences, comparison settings, etc.';