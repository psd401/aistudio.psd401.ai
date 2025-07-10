-- 010-initial-data.sql: Insert initial data for the application

-- Insert default roles
INSERT INTO roles (name, description) VALUES 
('admin', 'Administrator role with full access'),
('user', 'Standard user role')
ON CONFLICT DO NOTHING;

-- Insert default settings
INSERT INTO settings (key, value, category, description) VALUES
('system.version', '"1.0.0"', 'system', 'Current system version'),
('system.maintenance_mode', 'false', 'system', 'Whether the system is in maintenance mode')
ON CONFLICT (key) DO NOTHING;