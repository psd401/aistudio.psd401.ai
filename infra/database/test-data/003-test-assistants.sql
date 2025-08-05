-- Test Assistants for E2E Testing
-- These assistants should only exist in test environments
-- NEVER run this in production!

-- Test Assistant 1: Basic assistant for testing
INSERT INTO assistants (
    id,
    user_id,
    name,
    description,
    instructions,
    model,
    temperature,
    tools,
    created_at,
    updated_at
)
SELECT 
    'test-assistant-001',
    u.id,
    'E2E Test Assistant',
    'Assistant created for E2E testing purposes',
    'You are a helpful assistant for testing. Respond concisely to test queries.',
    'gpt-4',
    0.7,
    '["code_interpreter", "retrieval"]'::jsonb,
    CURRENT_TIMESTAMP - INTERVAL '7 days',
    CURRENT_TIMESTAMP - INTERVAL '7 days'
FROM users u
WHERE u.cognito_sub = 'test-user-001'
ON CONFLICT (id) DO UPDATE SET
    updated_at = CURRENT_TIMESTAMP;

-- Test Assistant 2: Admin assistant
INSERT INTO assistants (
    id,
    user_id,
    name,
    description,
    instructions,
    model,
    temperature,
    tools,
    created_at,
    updated_at
)
SELECT 
    'test-assistant-002',
    u.id,
    'Admin Test Assistant',
    'Assistant for testing admin functionality',
    'You are an administrative assistant for testing admin features.',
    'gpt-4-turbo',
    0.5,
    '["code_interpreter", "retrieval", "function_calling"]'::jsonb,
    CURRENT_TIMESTAMP - INTERVAL '3 days',
    CURRENT_TIMESTAMP - INTERVAL '3 days'
FROM users u
WHERE u.cognito_sub = 'test-admin-001'
ON CONFLICT (id) DO UPDATE SET
    updated_at = CURRENT_TIMESTAMP;

-- Test Thread for conversation testing
INSERT INTO threads (
    id,
    user_id,
    assistant_id,
    title,
    created_at,
    updated_at
)
SELECT 
    'test-thread-001',
    u.id,
    'test-assistant-001',
    'E2E Test Conversation',
    CURRENT_TIMESTAMP - INTERVAL '1 day',
    CURRENT_TIMESTAMP - INTERVAL '1 hour'
FROM users u
WHERE u.cognito_sub = 'test-user-001'
ON CONFLICT (id) DO UPDATE SET
    updated_at = CURRENT_TIMESTAMP;

-- Test Messages in thread
INSERT INTO messages (
    id,
    thread_id,
    role,
    content,
    created_at
)
VALUES 
    (
        'test-message-001',
        'test-thread-001',
        'user',
        'Hello, this is a test message for E2E testing.',
        CURRENT_TIMESTAMP - INTERVAL '1 hour'
    ),
    (
        'test-message-002',
        'test-thread-001',
        'assistant',
        'Hello! I understand this is for E2E testing. How can I help you test the application?',
        CURRENT_TIMESTAMP - INTERVAL '59 minutes'
    )
ON CONFLICT (id) DO NOTHING;