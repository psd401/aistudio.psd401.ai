-- 015-add-model-compare-tool.sql: Add Model Comparison tool to the tools table
-- Migration file - only runs on existing databases (not fresh installs)

-- Insert the Model Comparison tool
INSERT INTO tools (identifier, name, description, is_active, created_at, updated_at)
VALUES (
    'model-compare',
    'Model Comparison',
    'Compare responses from two different AI models side-by-side',
    true,
    NOW(),
    NOW()
);

-- Grant access to the Model Comparison tool for administrators
INSERT INTO role_tools (role_id, tool_id, created_at)
SELECT r.id, t.id, NOW()
FROM roles r, tools t
WHERE r.name = 'administrator' 
  AND t.identifier = 'model-compare'
  AND NOT EXISTS (
    SELECT 1 FROM role_tools rt 
    WHERE rt.role_id = r.id AND rt.tool_id = t.id
  );

-- Add navigation item for Model Comparison
INSERT INTO navigation_items (
    label, 
    icon, 
    link, 
    parent_id, 
    tool_id, 
    requires_role, 
    position, 
    is_active, 
    created_at,
    description,
    type
)
SELECT 
    'Model Compare',
    'IconGitCompare',
    '/compare',
    NULL,
    t.id,
    'administrator',
    40, -- Position after other main navigation items
    true,
    NOW(),
    'Compare AI model responses side-by-side',
    'link'
FROM tools t
WHERE t.identifier = 'model-compare'
  AND NOT EXISTS (
    SELECT 1 FROM navigation_items ni
    WHERE ni.link = '/compare'
  );