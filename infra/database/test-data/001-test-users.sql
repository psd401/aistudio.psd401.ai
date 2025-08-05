-- Test Users for E2E Testing
-- These users should only exist in test environments
-- NEVER run this in production!

-- Test User 1: Regular user with basic access
INSERT INTO users (cognito_sub, email, given_name, family_name, created_at, updated_at)
VALUES (
    'test-user-001',
    'test.user@example.com',
    'Test',
    'User',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
) ON CONFLICT (cognito_sub) DO UPDATE SET
    email = EXCLUDED.email,
    updated_at = CURRENT_TIMESTAMP;

-- Test User 2: Admin user with full access
INSERT INTO users (cognito_sub, email, given_name, family_name, created_at, updated_at)
VALUES (
    'test-admin-001',
    'test.admin@example.com',
    'Test',
    'Admin',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
) ON CONFLICT (cognito_sub) DO UPDATE SET
    email = EXCLUDED.email,
    updated_at = CURRENT_TIMESTAMP;

-- Test User 3: Limited access user
INSERT INTO users (cognito_sub, email, given_name, family_name, created_at, updated_at)
VALUES (
    'test-limited-001',
    'test.limited@example.com',
    'Test',
    'Limited',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
) ON CONFLICT (cognito_sub) DO UPDATE SET
    email = EXCLUDED.email,
    updated_at = CURRENT_TIMESTAMP;

-- Assign roles to test users
-- Admin user gets Administrator role
INSERT INTO user_roles (user_id, role_id, assigned_at, assigned_by)
SELECT
    u.id,
    (SELECT r.id FROM roles r WHERE r.name = 'Administrator'),
    CURRENT_TIMESTAMP,
    u.id
FROM users u
WHERE u.cognito_sub = 'test-admin-001'
ON CONFLICT (user_id, role_id) DO NOTHING;

-- Regular user gets User role
INSERT INTO user_roles (user_id, role_id, assigned_at, assigned_by)
SELECT
    u.id,
    (SELECT r.id FROM roles r WHERE r.name = 'User'),
    CURRENT_TIMESTAMP,
    u.id
FROM users u
WHERE u.cognito_sub = 'test-user-001'
ON CONFLICT (user_id, role_id) DO NOTHING;

-- Limited user gets User role with limited tool access
INSERT INTO user_roles (user_id, role_id, assigned_at, assigned_by)
SELECT
    u.id,
    (SELECT r.id FROM roles r WHERE r.name = 'User'),
    CURRENT_TIMESTAMP,
    u.id
FROM users u
WHERE u.cognito_sub = 'test-limited-001'
ON CONFLICT (user_id, role_id) DO NOTHING;