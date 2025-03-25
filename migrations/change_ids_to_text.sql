-- Drop foreign key constraints first
ALTER TABLE role_tools DROP CONSTRAINT IF EXISTS role_tools_role_id_fkey;
ALTER TABLE role_tools DROP CONSTRAINT IF EXISTS role_tools_tool_id_fkey;

-- Drop primary key constraints
ALTER TABLE roles DROP CONSTRAINT IF EXISTS roles_pkey;
ALTER TABLE tools DROP CONSTRAINT IF EXISTS tools_pkey;

-- Change ID columns to text
ALTER TABLE roles ALTER COLUMN id TYPE text USING id::text;
ALTER TABLE tools ALTER COLUMN id TYPE text USING id::text;
ALTER TABLE role_tools ALTER COLUMN role_id TYPE text USING role_id::text;
ALTER TABLE role_tools ALTER COLUMN tool_id TYPE text USING tool_id::text;

-- Remove serial sequences
ALTER TABLE roles ALTER COLUMN id DROP DEFAULT;
ALTER TABLE tools ALTER COLUMN id DROP DEFAULT;

-- Add back primary key constraints
ALTER TABLE roles ADD PRIMARY KEY (id);
ALTER TABLE tools ADD PRIMARY KEY (id);

-- Add back foreign key constraints
ALTER TABLE role_tools 
  ADD CONSTRAINT role_tools_role_id_fkey 
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE;

ALTER TABLE role_tools 
  ADD CONSTRAINT role_tools_tool_id_fkey 
  FOREIGN KEY (tool_id) REFERENCES tools(id) ON DELETE CASCADE;

-- Drop the id column from role_tools if it exists (since we're using a composite key of role_id and tool_id)
ALTER TABLE role_tools DROP COLUMN IF EXISTS id;

-- Add unique constraint to prevent duplicate role-tool assignments
ALTER TABLE role_tools ADD CONSTRAINT role_tools_role_id_tool_id_key UNIQUE (role_id, tool_id); 