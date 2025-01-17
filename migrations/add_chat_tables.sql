-- Add unique constraint to ai_models.model_id
ALTER TABLE ai_models ADD CONSTRAINT ai_models_model_id_unique UNIQUE (model_id);

-- Add conversations table
CREATE TABLE IF NOT EXISTS conversations (
    id SERIAL PRIMARY KEY,
    clerk_id VARCHAR(255) NOT NULL REFERENCES users(clerk_id),
    title TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    model_id TEXT NOT NULL
);

-- Add messages table
CREATE TABLE IF NOT EXISTS messages (
    id SERIAL PRIMARY KEY,
    conversation_id INTEGER NOT NULL REFERENCES conversations(id),
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Add foreign key after tables are created
ALTER TABLE conversations 
    ADD CONSTRAINT fk_conversations_model_id 
    FOREIGN KEY (model_id) 
    REFERENCES ai_models(model_id);

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_conversations_clerk_id ON conversations(clerk_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversations_created_at ON conversations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at ASC); 