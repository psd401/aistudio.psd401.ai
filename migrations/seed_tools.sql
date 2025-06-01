-- Insert tools
INSERT INTO tools (id, name, description, is_active) VALUES
('political-wording', 'Political Wording', 'Configure prompts and contexts for political wording analysis', true);

-- Insert roles if they don't exist
INSERT INTO roles (id, name, description, is_system) VALUES
('administrator', 'Administrator', 'Full system access', true),
('staff', 'Staff', 'Staff access', true),
('student', 'Student', 'Student access', true)
ON CONFLICT (id) DO NOTHING;

-- Assign tools to roles
INSERT INTO role_tools (role_id, tool_id) VALUES
('administrator', 'political-wording'),
('staff', 'political-wording'); 