-- Fix production database schema mismatches
-- Run this in AWS RDS Query Editor on the production database

-- 1. Fix navigation_items table - rename columns to match application code
ALTER TABLE navigation_items 
RENAME COLUMN title TO label;

ALTER TABLE navigation_items 
RENAME COLUMN url TO link;

ALTER TABLE navigation_items 
RENAME COLUMN role_required TO requires_role;

ALTER TABLE navigation_items 
RENAME COLUMN navigation_type TO type;

-- 2. Fix tool_input_fields table - drop and recreate with correct schema
DROP TABLE IF EXISTS tool_input_fields CASCADE;

CREATE TABLE tool_input_fields (
    id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    assistant_architect_id INTEGER NOT NULL,
    name VARCHAR(100) NOT NULL,
    label VARCHAR(255) NOT NULL,
    field_type field_type NOT NULL,
    position INTEGER DEFAULT 0,
    options JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- 3. Insert default roles if they don't exist
INSERT INTO roles (name, description) VALUES 
('admin', 'Administrator role with full access'),
('user', 'Standard user role')
ON CONFLICT DO NOTHING;