-- 019-fix-navigation-role-display.sql
-- Migration to fix role display in navigation items
-- Converts role IDs to role names for better UX

-- Update existing navigation items to use role names instead of IDs
UPDATE navigation_items 
SET requires_role = 'administrator'
WHERE requires_role = '1';

UPDATE navigation_items 
SET requires_role = 'staff'
WHERE requires_role = '2';

UPDATE navigation_items 
SET requires_role = 'student'
WHERE requires_role = '3';

-- Add comment to document the change
COMMENT ON COLUMN navigation_items.requires_role IS 'Role name required to access this navigation item (e.g., administrator, staff, student)';