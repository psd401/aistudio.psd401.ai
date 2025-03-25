-- Insert tools
INSERT INTO tools (id, name, description, is_active) VALUES
('communication-analysis', 'Communication Analysis', 'Configure audiences, AI models, and prompts for communication analysis', true),
('meta-prompting', 'Meta-Prompting', 'Configure meta-prompting techniques and templates', true),
('political-wording', 'Political Wording', 'Configure prompts and contexts for political wording analysis', true);

-- Insert roles if they don't exist
INSERT INTO roles (id, name, description, is_system) VALUES
('administrator', 'Administrator', 'Full system access', true),
('staff', 'Staff', 'Staff access', true),
('student', 'Student', 'Student access', true)
ON CONFLICT (id) DO NOTHING;

-- Assign tools to roles
INSERT INTO role_tools (role_id, tool_id) VALUES
('administrator', 'communication-analysis'),
('administrator', 'meta-prompting'),
('administrator', 'political-wording'),
('staff', 'communication-analysis'),
('staff', 'meta-prompting'),
('staff', 'political-wording'); 