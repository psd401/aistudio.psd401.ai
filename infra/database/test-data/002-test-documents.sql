-- Test Documents for E2E Testing
-- These documents should only exist in test environments
-- NEVER run this in production!

-- Test Document 1: Processed document
INSERT INTO documents (
    id,
    user_id,
    filename,
    s3_key,
    file_size,
    mime_type,
    status,
    created_at,
    updated_at,
    processed_at
)
SELECT 
    '550e8400-e29b-41d4-a716-446655440001'::uuid,
    u.id,
    'test-document-1.pdf',
    'test-data/test-document-1.pdf',
    1024000, -- 1MB
    'application/pdf',
    'processed',
    CURRENT_TIMESTAMP - INTERVAL '1 day',
    CURRENT_TIMESTAMP - INTERVAL '1 day',
    CURRENT_TIMESTAMP - INTERVAL '23 hours'
FROM users u
WHERE u.cognito_sub = 'test-user-001'
ON CONFLICT (id) DO UPDATE SET
    updated_at = CURRENT_TIMESTAMP;

-- Test Document 2: Processing document
INSERT INTO documents (
    id,
    user_id,
    filename,
    s3_key,
    file_size,
    mime_type,
    status,
    created_at,
    updated_at
)
SELECT 
    '550e8400-e29b-41d4-a716-446655440002'::uuid,
    u.id,
    'test-document-2.docx',
    'test-data/test-document-2.docx',
    2048000, -- 2MB
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'processing',
    CURRENT_TIMESTAMP - INTERVAL '2 hours',
    CURRENT_TIMESTAMP - INTERVAL '2 hours'
FROM users u
WHERE u.cognito_sub = 'test-user-001'
ON CONFLICT (id) DO UPDATE SET
    updated_at = CURRENT_TIMESTAMP;

-- Test Document 3: Failed document
INSERT INTO documents (
    id,
    user_id,
    filename,
    s3_key,
    file_size,
    mime_type,
    status,
    error_message,
    created_at,
    updated_at
)
SELECT 
    '550e8400-e29b-41d4-a716-446655440003'::uuid,
    u.id,
    'test-document-3-corrupted.pdf',
    'test-data/test-document-3-corrupted.pdf',
    512000, -- 512KB
    'application/pdf',
    'failed',
    'Failed to process document: Invalid PDF structure',
    CURRENT_TIMESTAMP - INTERVAL '3 days',
    CURRENT_TIMESTAMP - INTERVAL '3 days'
FROM users u
WHERE u.cognito_sub = 'test-admin-001'
ON CONFLICT (id) DO UPDATE SET
    updated_at = CURRENT_TIMESTAMP;

-- Test Document Content for search testing
INSERT INTO document_content (
    document_id,
    content,
    metadata,
    created_at
)
VALUES (
    '550e8400-e29b-41d4-a716-446655440001'::uuid,
    'This is a test document for E2E testing. It contains sample content about artificial intelligence, machine learning, and natural language processing. This content is used to test the search functionality.',
    '{"pages": 5, "author": "Test Author", "title": "E2E Test Document"}'::jsonb,
    CURRENT_TIMESTAMP - INTERVAL '23 hours'
) ON CONFLICT (document_id) DO UPDATE SET
    content = EXCLUDED.content,
    metadata = EXCLUDED.metadata;