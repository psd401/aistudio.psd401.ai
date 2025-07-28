-- 010-knowledge-repositories.sql: Knowledge repository system tables
-- These tables support the document and knowledge management features

-- Enable pgvector extension for embeddings support
CREATE EXTENSION IF NOT EXISTS vector;

-- Knowledge repositories table: Container for documents and knowledge items
CREATE TABLE IF NOT EXISTS knowledge_repositories (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    is_public BOOLEAN DEFAULT false,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Repository items table: Individual documents, URLs, or text items in a repository
CREATE TABLE IF NOT EXISTS repository_items (
    id SERIAL PRIMARY KEY,
    repository_id INTEGER NOT NULL REFERENCES knowledge_repositories(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('document', 'url', 'text')),
    name TEXT NOT NULL,
    source TEXT NOT NULL, -- File path, URL, or inline text
    metadata JSONB,
    processing_status TEXT DEFAULT 'pending' CHECK (processing_status IN ('pending', 'processing', 'processing_ocr', 'processing_embeddings', 'completed', 'embedded', 'failed', 'embedding_failed')),
    processing_error TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Repository item chunks table: Text chunks for semantic search
CREATE TABLE IF NOT EXISTS repository_item_chunks (
    id SERIAL PRIMARY KEY,
    item_id INTEGER NOT NULL REFERENCES repository_items(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    chunk_index INTEGER NOT NULL,
    metadata JSONB,
    embedding vector(1536), -- OpenAI embeddings dimension
    tokens INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Repository access table: Control who can access repositories
CREATE TABLE IF NOT EXISTS repository_access (
    id SERIAL PRIMARY KEY,
    repository_id INTEGER NOT NULL REFERENCES knowledge_repositories(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    role_id INTEGER REFERENCES roles(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    -- Either user_id or role_id should be set, not both
    CONSTRAINT check_user_or_role CHECK (
        (user_id IS NOT NULL AND role_id IS NULL) OR 
        (user_id IS NULL AND role_id IS NOT NULL)
    )
);

-- Create indexes for repository tables
CREATE INDEX IF NOT EXISTS idx_repository_items_repository_id ON repository_items(repository_id);
CREATE INDEX IF NOT EXISTS idx_repository_items_processing_status ON repository_items(processing_status);
CREATE INDEX IF NOT EXISTS idx_repository_item_chunks_item_id ON repository_item_chunks(item_id);
CREATE INDEX IF NOT EXISTS idx_repository_item_chunks_embedding ON repository_item_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX IF NOT EXISTS idx_repository_access_repository_id ON repository_access(repository_id);
CREATE INDEX IF NOT EXISTS idx_repository_access_user_id ON repository_access(user_id);
CREATE INDEX IF NOT EXISTS idx_repository_access_role_id ON repository_access(role_id);