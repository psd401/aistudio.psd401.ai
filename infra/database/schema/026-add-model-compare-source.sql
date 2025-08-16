-- 025-add-model-compare-source.sql: Add model-compare as a valid source for conversations

-- Drop the existing constraint
ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_source_check;

-- Add the updated constraint with model-compare included
ALTER TABLE conversations 
ADD CONSTRAINT conversations_source_check 
CHECK (source = ANY (ARRAY['chat'::text, 'assistant_execution'::text, 'model-compare'::text]));