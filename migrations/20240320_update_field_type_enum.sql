-- Step 1: Create a new enum type with the desired values
CREATE TYPE field_type_new AS ENUM ('short_text', 'long_text', 'select', 'multi_select');

-- Step 2: Update existing data to use new values
UPDATE tool_input_fields SET field_type = 'short_text'::field_type_new WHERE field_type = 'text'::field_type;

-- Step 3: Drop the old type and rename the new one
ALTER TABLE tool_input_fields ALTER COLUMN field_type TYPE field_type_new USING field_type::text::field_type_new;
DROP TYPE field_type;
ALTER TYPE field_type_new RENAME TO field_type; 