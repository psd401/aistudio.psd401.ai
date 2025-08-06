-- 018-model-replacement-audit.sql: Create audit table for tracking AI model replacements
-- Migration file - only runs on existing databases (not fresh installs)

-- Model replacement audit table: Track all model replacements for compliance and debugging
CREATE TABLE IF NOT EXISTS model_replacement_audit (
    id BIGSERIAL PRIMARY KEY,
    original_model_id INTEGER NOT NULL,
    original_model_name TEXT NOT NULL,
    replacement_model_id INTEGER NOT NULL,
    replacement_model_name TEXT NOT NULL,
    replaced_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    chain_prompts_updated INTEGER DEFAULT 0,
    conversations_updated INTEGER DEFAULT 0,
    model_comparisons_updated INTEGER DEFAULT 0,
    executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_model_replacement_audit_replaced_by ON model_replacement_audit(replaced_by);
CREATE INDEX IF NOT EXISTS idx_model_replacement_audit_executed_at ON model_replacement_audit(executed_at DESC);
CREATE INDEX IF NOT EXISTS idx_model_replacement_audit_original_model ON model_replacement_audit(original_model_id);
CREATE INDEX IF NOT EXISTS idx_model_replacement_audit_replacement_model ON model_replacement_audit(replacement_model_id);

-- Add comment for documentation
COMMENT ON TABLE model_replacement_audit IS 'Audit trail for AI model replacements, tracking which models were replaced and the impact';
COMMENT ON COLUMN model_replacement_audit.original_model_id IS 'ID of the model that was deleted/replaced';
COMMENT ON COLUMN model_replacement_audit.original_model_name IS 'Name of the model at time of replacement (denormalized for history)';
COMMENT ON COLUMN model_replacement_audit.replacement_model_id IS 'ID of the model that replaced the original';
COMMENT ON COLUMN model_replacement_audit.replacement_model_name IS 'Name of the replacement model at time of replacement';
COMMENT ON COLUMN model_replacement_audit.replaced_by IS 'User ID who performed the replacement';
COMMENT ON COLUMN model_replacement_audit.chain_prompts_updated IS 'Number of chain_prompts records updated';
COMMENT ON COLUMN model_replacement_audit.conversations_updated IS 'Number of conversations records updated';
COMMENT ON COLUMN model_replacement_audit.model_comparisons_updated IS 'Number of model_comparisons records updated';
COMMENT ON COLUMN model_replacement_audit.executed_at IS 'Timestamp when the replacement was executed';