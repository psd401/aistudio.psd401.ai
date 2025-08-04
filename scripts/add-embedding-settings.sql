-- Add embedding-specific settings to the database
-- These settings will be used by the embedding generation Lambda and search functionality

-- Insert embedding model provider (using OpenAI as standard)
INSERT INTO settings (key, value, description, category, is_secret)
VALUES (
  'EMBEDDING_MODEL_PROVIDER',
  'openai',
  'Provider for embedding generation (openai, bedrock, azure)',
  'embeddings',
  false
)
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value,
    description = EXCLUDED.description,
    category = EXCLUDED.category,
    updated_at = CURRENT_TIMESTAMP;

-- Insert embedding model ID (using text-embedding-3-small for cost efficiency)
INSERT INTO settings (key, value, description, category, is_secret)
VALUES (
  'EMBEDDING_MODEL_ID',
  'text-embedding-3-small',
  'Model ID for embedding generation (e.g., text-embedding-3-small, text-embedding-ada-002)',
  'embeddings',
  false
)
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value,
    description = EXCLUDED.description,
    category = EXCLUDED.category,
    updated_at = CURRENT_TIMESTAMP;

-- Insert embedding dimensions (1536 for text-embedding-3-small)
INSERT INTO settings (key, value, description, category, is_secret)
VALUES (
  'EMBEDDING_DIMENSIONS',
  '1536',
  'Number of dimensions in the embedding vector',
  'embeddings',
  false
)
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value,
    description = EXCLUDED.description,
    category = EXCLUDED.category,
    updated_at = CURRENT_TIMESTAMP;

-- Insert embedding batch size for processing efficiency
INSERT INTO settings (key, value, description, category, is_secret)
VALUES (
  'EMBEDDING_BATCH_SIZE',
  '100',
  'Number of text chunks to process in a single embedding API call',
  'embeddings',
  false
)
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value,
    description = EXCLUDED.description,
    category = EXCLUDED.category,
    updated_at = CURRENT_TIMESTAMP;

-- Insert hybrid search weight (0.7 = 70% semantic, 30% keyword)
INSERT INTO settings (key, value, description, category, is_secret)
VALUES (
  'HYBRID_SEARCH_WEIGHT',
  '0.7',
  'Weight for semantic search in hybrid search (0-1, where 1 is 100% semantic)',
  'embeddings',
  false
)
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value,
    description = EXCLUDED.description,
    category = EXCLUDED.category,
    updated_at = CURRENT_TIMESTAMP;

-- Insert max tokens per chunk for embedding
INSERT INTO settings (key, value, description, category, is_secret)
VALUES (
  'EMBEDDING_MAX_TOKENS',
  '8191',
  'Maximum tokens allowed per text chunk for embedding (model-specific limit)',
  'embeddings',
  false
)
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value,
    description = EXCLUDED.description,
    category = EXCLUDED.category,
    updated_at = CURRENT_TIMESTAMP;

-- Query to verify the settings were added
SELECT key, value, description, category 
FROM settings 
WHERE category = 'embeddings' 
ORDER BY key;