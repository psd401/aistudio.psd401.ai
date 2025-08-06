-- 020-add-user-role-version.sql
-- Simple migration to add role_version column for tracking role changes
-- Keeping it simple to work with RDS Data API limitations

-- Add role_version column if it doesn't exist
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS role_version INTEGER DEFAULT 1;

-- Set default value for any existing NULL values
UPDATE users 
SET role_version = 1 
WHERE role_version IS NULL;

-- Add index for performance if it doesn't exist
CREATE INDEX IF NOT EXISTS idx_users_role_version ON users(role_version);

-- Add documentation comment
COMMENT ON COLUMN users.role_version IS 'Incremented when user roles change to invalidate cached sessions';