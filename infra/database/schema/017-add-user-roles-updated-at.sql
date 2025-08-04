-- Add missing updated_at column to user_roles table
ALTER TABLE user_roles 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

-- Create trigger to update the timestamp on modification
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Only create the trigger if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger 
        WHERE tgname = 'update_user_roles_updated_at'
    ) THEN
        CREATE TRIGGER update_user_roles_updated_at 
        BEFORE UPDATE ON user_roles 
        FOR EACH ROW 
        EXECUTE FUNCTION update_updated_at_column();
    END IF;
END;
$$;