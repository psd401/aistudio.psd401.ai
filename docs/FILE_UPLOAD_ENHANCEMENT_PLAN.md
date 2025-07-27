# File Upload System Enhancement Plan

## Overview

This document outlines the plan to enhance the file upload system across the AI Studio application. The goal is to create a unified, scalable system that supports large files, multiple formats, and uses vector embeddings for intelligent retrieval.

## Project Status Summary (Updated 2025-01-26)

### ✅ Completed Phases
- **Phase 1: Admin Repository System** - Full CRUD operations, file upload, basic management
- **Phase 2: File Processing Infrastructure** - Lambda functions, text extraction, chunking, status tracking

### 🚀 What's Working Now
- Create and manage knowledge repositories
- Upload documents (PDF, Word, Excel, CSV, Text, Markdown)
- Automatic text extraction and chunking
- Real-time processing status updates
- File downloads with proper extensions
- S3 cleanup on deletion
- Basic text search within repositories

### 🔄 Next Phase: Embeddings & Vector Search
**Goal**: Add semantic search capabilities with AI-powered embeddings

**Key Tasks**:
1. Configure embedding model settings (OpenAI/Bedrock/Azure)
2. Create Lambda function for embedding generation
3. Implement vector similarity search
4. Add hybrid search (keyword + semantic)
5. Create search UI with relevance ranking

**Benefits**:
- Natural language search queries
- Find semantically similar content
- Better search accuracy
- Support for "find documents about X" queries

### ⏳ Future Phases
- **Phase 4: Assistant Integration** - Connect repositories to AI assistants for context-aware responses

## Current Implementation Status

### ✅ Phase 1: Admin Repository System - COMPLETED (2025-01-26)

**What was implemented:**
- Full CRUD operations for knowledge repositories
- Repository list, detail, and form components
- Support for three content types: documents, URLs, and text
- File upload to S3 for document storage
- Repository items management with status tracking
- Server actions with proper authentication and authorization
- Type-safe implementation with no TypeScript errors

**Key files created:**
- `/app/(protected)/admin/repositories/` - All repository pages
- `/components/features/repositories/` - All UI components
- `/actions/repositories/` - Server actions for repositories and items
- Database tables already existed (no migration needed)

**Bug fixes during implementation:**
- Fixed database connection defaulting to "master" instead of "aistudio"
- Fixed foreign key constraint violations (Cognito sub vs user ID mapping)
- Fixed infinite reload loop in repository list
- Fixed date formatting errors with null timestamps
- Fixed Next.js 15 params Promise handling

**Current limitations:**
- Search functionality is basic text search only (no embeddings)
- Access control UI is placeholder only
- No URL processing implemented yet (stub in place)

### ✅ Phase 2: File Processing Infrastructure - COMPLETED (2025-01-26)

**What was implemented:**
- CDK ProcessingStack with SQS queue, DynamoDB table, and Lambda functions
- FileProcessor Lambda for document text extraction and chunking
- URLProcessor Lambda for web content extraction
- Shared Lambda layer with processing dependencies
- File processing service with presigned URL generation
- Integration with repository items to trigger processing
- Support for PDF, Word, Excel, CSV, Text, and Markdown files
- Auto-refresh UI every 5 seconds when items are processing
- Working file download with proper file extensions

**Key infrastructure created:**
- `/infra/lib/processing-stack.ts` - CDK stack definition
- `/infra/lambdas/file-processor/` - Document processing Lambda
- `/infra/lambdas/url-processor/` - URL processing Lambda
- `/lib/services/file-processing-service.ts` - Processing service

**Bug fixes completed:**
- Fixed Lambda using wrong table name (document_chunks → repository_item_chunks)
- Fixed file upload stack overflow with large files
- Fixed repository display showing empty owner names and dates
- Fixed all TypeScript interfaces to use camelCase (matching RDS Data API)
- Added S3 cleanup when deleting repositories
- Fixed file downloads to preserve original file extensions

**Current status:**
- ✅ File upload and processing fully functional
- ✅ Status updates working correctly
- ✅ File downloads working with proper extensions
- ✅ Repository and item deletion cleans up S3 files
- ✅ All TypeScript and linting checks passing

### 🔄 Phase 3: Embeddings & Vector Search - NEXT UP

### ⏳ Phase 4: Assistant Integration - PLANNED

## Current State Analysis

### 1. Assistant Architect PDF Upload
- Uses temporary job-based processing
- 25MB size limit
- PDF-only support
- Converts to markdown using AI model
- No persistent storage
- Content inserted directly into prompts

### 2. Chat Document Upload
- 10MB frontend / 25MB backend limit
- Supports PDF, DOCX, TXT
- Permanent S3 storage
- Basic text chunking (1000 chars)
- Simple keyword search (no embeddings)
- Has infrastructure for embeddings but not implemented

### 3. Infrastructure
- S3 bucket already configured with versioning
- Database tables exist for documents and chunks
- No vector database or embedding generation
- WAF limits requests to 25MB

## Implementation Phases

### Phase 1: Admin Repository System (Standalone Implementation)

**Goal**: Create a complete knowledge repository system in `/admin` that can be tested independently without affecting existing functionality.

#### 1.1 Database Schema
```sql
-- Knowledge repositories table
CREATE TABLE knowledge_repositories (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  owner_id INTEGER REFERENCES users(id),
  is_public BOOLEAN DEFAULT false,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Repository items (documents, URLs, text)
CREATE TABLE repository_items (
  id SERIAL PRIMARY KEY,
  repository_id INTEGER REFERENCES knowledge_repositories(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('document', 'url', 'text')),
  name TEXT NOT NULL,
  source TEXT NOT NULL, -- S3 key for documents, URL for urls, direct content for text
  metadata JSONB DEFAULT '{}',
  processing_status TEXT DEFAULT 'pending',
  processing_error TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Enhanced document chunks with embeddings
CREATE TABLE repository_item_chunks (
  id SERIAL PRIMARY KEY,
  item_id INTEGER REFERENCES repository_items(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  embedding_vector REAL[],
  metadata JSONB DEFAULT '{}',
  chunk_index INTEGER NOT NULL,
  tokens INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Repository access control
CREATE TABLE repository_access (
  id SERIAL PRIMARY KEY,
  repository_id INTEGER REFERENCES knowledge_repositories(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id),
  role_id INTEGER REFERENCES roles(id),
  access_level TEXT DEFAULT 'read' CHECK (access_level IN ('read', 'write', 'admin')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### 1.2 UI Components
- `/app/(protected)/admin/repositories/page.tsx` - Repository list
- `/app/(protected)/admin/repositories/[id]/page.tsx` - Repository detail/management
- `/components/features/repositories/repository-list.tsx`
- `/components/features/repositories/repository-form.tsx`
- `/components/features/repositories/repository-item-list.tsx`
- `/components/features/repositories/file-upload-modal.tsx`

#### 1.3 Server Actions
- `/actions/repositories/repository.actions.ts`
  - `createRepository()`
  - `updateRepository()`
  - `deleteRepository()`
  - `listRepositories()`
  - `getRepository()`
- `/actions/repositories/repository-items.actions.ts`
  - `addRepositoryItem()`
  - `removeRepositoryItem()`
  - `listRepositoryItems()`
  - `searchRepositoryItems()`

#### 1.4 Features
- Create/edit/delete repositories
- Upload multiple files at once
- Add URLs and text snippets
- View processing status
- Search within repository
- Access control management
- File preview capability

### Phase 2: File Processing Infrastructure

**Goal**: Build robust file processing that handles large files and multiple formats.

#### 2.1 CDK Infrastructure Changes

**New Processing Stack** (`/infra/lib/processing-stack.ts`):
```typescript
- SQS Queue for file processing jobs
- Lambda function for file processing (10 min timeout, 3GB memory)
- Step Functions for orchestrating complex workflows
- EventBridge for job scheduling and monitoring
```

**Lambda Functions**:
1. **FileProcessor** (`/infra/lambdas/file-processor/`)
   - Extract text from various formats (PDF, DOCX, XLSX, PPTX, CSV, TXT, MD)
   - Chunk text intelligently based on document structure
   - Store chunks in database
   - Trigger embedding generation

2. **URLProcessor** (`/infra/lambdas/url-processor/`)
   - Fetch URL content
   - Extract and clean text
   - Process same as documents

**Updates to StorageStack**:
- Add lifecycle rules for processed files
- Add event notifications for S3 uploads
- Configure CORS for multipart uploads

#### 2.2 File Processing Service
- `/lib/services/file-processor.ts`
  - Support for streaming multipart uploads
  - File type detection and validation
  - Virus scanning integration point
  - Progress tracking via SQS/DynamoDB

#### 2.3 Supported File Types
- **Documents**: PDF, DOCX, DOC, ODT, RTF
- **Spreadsheets**: XLSX, XLS, CSV, ODS
- **Presentations**: PPTX, PPT, ODP
- **Text**: TXT, MD, JSON, XML, HTML
- **Future**: Images (OCR), Audio (transcription), Video (metadata)

#### 2.4 Processing Pipeline
1. File uploaded to S3 via presigned URL
2. S3 event triggers Lambda
3. Lambda extracts text based on file type
4. Text is chunked intelligently (semantic boundaries)
5. Chunks stored in database
6. Job status updated
7. User notified via WebSocket/polling

### Phase 3: Embeddings & Vector Search

**Goal**: Add semantic search capabilities with configurable embedding models.

#### 3.1 Settings Configuration
Add to Settings system:
- `EMBEDDING_MODEL_PROVIDER` (openai, bedrock, azure)
- `EMBEDDING_MODEL_ID` (text-embedding-3-small, etc.)
- `EMBEDDING_DIMENSIONS` (1536, 384, etc.)
- `EMBEDDING_BATCH_SIZE` (100)

#### 3.2 Embedding Generation Lambda
**EmbeddingGenerator** (`/infra/lambdas/embedding-generator/`)
- Batch process chunks from SQS
- Support multiple providers via settings
- Handle rate limits and retries
- Store embeddings in PostgreSQL array column

#### 3.3 Vector Search Implementation
- **Hybrid Search** in `/lib/search/hybrid-search.ts`:
  ```typescript
  - Keyword search (existing)
  - Vector similarity search (cosine similarity)
  - Result fusion with configurable weights
  - Re-ranking based on relevance
  ```

- **PostgreSQL pgvector Extension** (optional future enhancement):
  ```sql
  CREATE EXTENSION vector;
  ALTER TABLE repository_item_chunks 
  ADD COLUMN embedding vector(1536);
  CREATE INDEX ON repository_item_chunks 
  USING ivfflat (embedding vector_cosine_ops);
  ```

#### 3.4 Search API
- `/api/repositories/search` endpoint
- Support for:
  - Natural language queries
  - Filtering by repository/type
  - Pagination
  - Relevance scoring
  - Snippet generation

### Phase 4: Assistant Integration

**Goal**: Integrate repository system with assistants while maintaining backward compatibility.

#### 4.1 Database Updates
```sql
-- Link assistants to repositories
CREATE TABLE assistant_repositories (
  id SERIAL PRIMARY KEY,
  assistant_id INTEGER REFERENCES assistants(id) ON DELETE CASCADE,
  repository_id INTEGER REFERENCES knowledge_repositories(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### 4.2 Assistant Architect Updates
- Add repository selection to prompt builder
- Show repository contents preview
- Allow testing with sample queries
- Token usage estimation

#### 4.3 Execution Updates
- Modify execution to:
  1. Analyze user input
  2. Search relevant repositories
  3. Retrieve top-k chunks
  4. Inject into context
  5. Track usage

#### 4.4 Backward Compatibility
- Existing PDF upload continues to work
- Gradual migration path:
  - New assistants use repositories
  - Existing assistants can opt-in
  - Migration tool for existing content

## Infrastructure Requirements Summary

### New CDK Resources
1. **ProcessingStack**:
   - SQS Queue (file-processing-queue)
   - DLQ for failed jobs
   - Lambda: FileProcessor (3GB, 10min timeout)
   - Lambda: URLProcessor (1GB, 5min timeout)
   - Lambda: EmbeddingGenerator (1GB, 5min timeout)
   - Step Functions for orchestration
   - EventBridge for scheduling

2. **Updates to Existing Stacks**:
   - **StorageStack**: S3 event notifications, multipart upload config
   - **DatabaseStack**: pgvector extension (future)
   - **FrontendStack**: Environment variables for processing

### Environment Variables
```
# Processing
FILE_PROCESSING_QUEUE_URL
FILE_PROCESSOR_LAMBDA_ARN
MAX_FILE_SIZE_MB=100
SUPPORTED_FILE_TYPES=pdf,docx,xlsx,pptx,txt,md,csv

# Embeddings (configurable in Settings)
EMBEDDING_MODEL_PROVIDER=openai
EMBEDDING_MODEL_ID=text-embedding-3-small
EMBEDDING_DIMENSIONS=1536
EMBEDDING_BATCH_SIZE=100
```

## Testing Strategy

### Phase 1 Testing (Admin Repositories)
1. Create test repository
2. Upload various file types
3. Add URLs and text
4. Test search functionality
5. Verify access controls
6. No impact on existing features

### Phase 2 Testing (Processing)
1. Test file size limits
2. Test all file formats
3. Verify chunking quality
4. Monitor Lambda performance
5. Test error handling

### Phase 3 Testing (Embeddings)
1. Compare search quality
2. Test different models
3. Measure performance
4. Verify cost tracking

### Phase 4 Testing (Integration)
1. Create test assistant
2. Compare with old method
3. Test migration tool
4. Verify no regression

## Migration Plan

1. **Phase 1**: Deploy standalone repository system
2. **Phase 2**: Add processing infrastructure, test with repositories
3. **Phase 3**: Enable embeddings, compare search quality
4. **Phase 4**: Gradual assistant migration:
   - New assistants use repositories
   - Add migration tool
   - Deprecate old upload method
   - Full migration over 2-3 months

## Cost Considerations

**Monthly Estimates** (1000 documents, 10MB avg):
- S3 Storage: $0.23
- Lambda Processing: $10-20
- Embeddings (OpenAI): $50-100
- Data Transfer: $5-10
- Total: ~$100-150/month

**Optimization Strategies**:
- Cache embeddings
- Batch processing
- Compress stored content
- Use smaller embedding models where appropriate

## Implementation Timeline

- **Phase 1**: 1-2 weeks (Admin Repository System)
- **Phase 2**: 2-3 weeks (File Processing Infrastructure)
- **Phase 3**: 1-2 weeks (Embeddings & Search)
- **Phase 4**: 1-2 weeks (Assistant Integration)
- **Total**: 5-9 weeks

## Success Criteria

1. Support for files up to 100MB
2. Processing of 10+ file formats
3. Sub-second semantic search
4. No regression in existing features
5. Cost-effective at scale
6. Easy migration path

This phased approach allows testing each component independently while building toward a comprehensive solution that can handle large files, multiple formats, and scale to support future media types.