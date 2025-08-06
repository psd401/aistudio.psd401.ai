-- 022-navigation-multi-roles.sql
-- Add support for multiple roles on navigation items

-- Create junction table for navigation item roles
CREATE TABLE IF NOT EXISTS navigation_item_roles (
    id SERIAL PRIMARY KEY,
    navigation_item_id INTEGER NOT NULL,
    role_name VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add comment
COMMENT ON TABLE navigation_item_roles IS 'Junction table for navigation items and roles';