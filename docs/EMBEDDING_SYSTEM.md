# Embedding System Documentation

## Overview

The AI Studio platform includes a comprehensive embedding generation system for semantic search and similarity matching. This system processes text chunks from documents and generates vector embeddings using configurable AI models.

## Architecture

### Components

1. **File Processor Lambda**
   - Extracts text from uploaded documents
   - Chunks text into manageable pieces
   - Queues chunks for embedding generation
   - Updates processing status

2. **Embedding Generator Lambda**
   - Receives chunks from SQS queue
   - Generates embeddings using configured AI provider
   - Stores embeddings in PostgreSQL
   - Updates item status to "embedded"

3. **Database Schema**
   - `repository_item_chunks.embedding_vector`: PostgreSQL `real[]` array
   - `settings` table: Stores embedding configuration
   - Supports vectors of varying dimensions (typically 1536 for OpenAI)

### Processing Flow

```
File Upload → S3 → File Processor → Text Chunks → SQS Queue → Embedding Generator → PostgreSQL
```

## Configuration

Embedding settings are stored in the database and can be configured via the admin settings UI:

```sql
-- Example configuration
INSERT INTO settings (category, key, value) VALUES
('embeddings', 'provider', '"openai"'),
('embeddings', 'modelId', '"text-embedding-ada-002"'),
('embeddings', 'dimensions', '1536'),
('embeddings', 'batchSize', '100');
```

### Supported Providers

- **OpenAI**: text-embedding-ada-002, text-embedding-3-small, text-embedding-3-large
- **AWS Bedrock**: amazon.titan-embed-text-v1, cohere.embed-english-v3
- **Azure OpenAI**: Configured deployment names

## Implementation Details

### Embedding Generation

The system uses the AI SDK for unified provider access:

```typescript
// In ai-helpers.ts
export async function generateEmbedding(
  text: string,
  config?: Partial<EmbeddingConfig>
): Promise<number[]> {
  const embeddingConfig = config ? { ...await getEmbeddingConfig(), ...config } : await getEmbeddingConfig()
  const modelConfig: ModelConfig = {
    provider: embeddingConfig.provider,
    modelId: embeddingConfig.modelId
  }
  const model = await getModelClient(modelConfig)
  const result = await embed({ model, value: text })
  return Array.from(result.embedding)
}
```

### PostgreSQL Storage

Embeddings are stored as PostgreSQL arrays for efficient operations:

```sql
-- Creating the column
ALTER TABLE repository_item_chunks 
ADD COLUMN embedding_vector real[];

-- Storing embeddings (with proper casting)
UPDATE repository_item_chunks 
SET embedding_vector = '{0.123, 0.456, ...}'::real[] 
WHERE id = :id;
```

### Status Tracking

Repository items progress through these statuses:
- `pending`: Initial upload
- `processing`: Text extraction and chunking
- `processing_embeddings`: Generating embeddings
- `embedded`: Successfully embedded
- `embedding_failed`: Error during embedding generation

## Environment Variables

Required for Lambda functions:
- `DB_CLUSTER_ARN`: RDS cluster ARN
- `DB_SECRET_ARN`: Database secret ARN
- `DB_NAME`: Database name (default: 'aistudio')
- `EMBEDDING_QUEUE_URL`: SQS queue URL for embedding jobs

## Error Handling

- Failed embeddings are sent to Dead Letter Queue after 3 attempts
- Errors are logged to CloudWatch
- Item status updated to "embedding_failed" with error message

## Performance Considerations

- Batch processing: Up to 100 texts per API call (configurable)
- Lambda memory: 1GB allocated for embedding generation
- Queue visibility timeout: 10 minutes
- Automatic retry with exponential backoff

## Future Enhancements

- Vector similarity search implementation
- Hybrid search combining keywords and semantics
- Embedding model comparison and A/B testing
- Incremental embedding updates
- Support for multimodal embeddings