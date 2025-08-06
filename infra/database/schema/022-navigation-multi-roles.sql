-- 022-navigation-multi-roles.sql
-- Add support for multiple roles on navigation items

-- Create junction table for navigation item roles
CREATE TABLE IF NOT EXISTS navigation_item_roles (
    id SERIAL PRIMARY KEY,
    navigation_item_id INTEGER NOT NULL,
    role_name VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(navigation_item_id, role_name)
);

-- Add foreign key constraint
ALTER TABLE navigation_item_roles 
ADD CONSTRAINT IF NOT EXISTS fk_navigation_item_roles_item
FOREIGN KEY (navigation_item_id) REFERENCES navigation_items(id) ON DELETE CASCADE;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_navigation_item_roles_item_id 
ON navigation_item_roles(navigation_item_id);

CREATE INDEX IF NOT EXISTS idx_navigation_item_roles_role_name 
ON navigation_item_roles(role_name);

-- Migrate existing requires_role data to new table
INSERT INTO navigation_item_roles (navigation_item_id, role_name)
SELECT id, requires_role 
FROM navigation_items 
WHERE requires_role IS NOT NULL
ON CONFLICT (navigation_item_id, role_name) DO NOTHING;

-- Add comment
COMMENT ON TABLE navigation_item_roles IS 'Junction table for navigation items and roles - supports multiple roles per item';