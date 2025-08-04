-- Migration: Add knowledge-repositories tool
-- Description: Creates a new tool for managing knowledge repositories with role-based access
-- Date: 2025-07-31

-- Add the knowledge-repositories tool if it doesn't exist
INSERT INTO tools (identifier, name, description, is_active, created_at, updated_at)
SELECT 
    'knowledge-repositories',
    'Knowledge Repository Manager',
    'Manage and search organizational knowledge repositories',
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
WHERE NOT EXISTS (
    SELECT 1 FROM tools WHERE identifier = 'knowledge-repositories'
);

-- Assign the tool to the administrator role if not already assigned
INSERT INTO role_tools (role_id, tool_id, created_at)
SELECT 
    r.id,
    t.id,
    CURRENT_TIMESTAMP
FROM roles r
CROSS JOIN tools t
WHERE r.name = 'administrator' 
  AND t.identifier = 'knowledge-repositories'
  AND NOT EXISTS (
    SELECT 1 FROM role_tools rt 
    WHERE rt.role_id = r.id AND rt.tool_id = t.id
  );

-- Add navigation item for the repositories tool
INSERT INTO navigation_items (label, link, icon, tool_id, parent_id, requires_role, position, is_active, type)
SELECT 
    'Repositories',
    '/repositories',
    'IconFolder',
    (SELECT id FROM tools WHERE identifier = 'knowledge-repositories'),
    NULL,
    NULL,
    50,
    true,
    'link'
WHERE NOT EXISTS (
    SELECT 1 FROM navigation_items WHERE link = '/repositories'
);