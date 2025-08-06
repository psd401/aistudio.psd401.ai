# Test Data Management

This directory contains SQL scripts for seeding test data in E2E testing environments.

## ⚠️ WARNING ⚠️
**NEVER run these scripts in production!** They are designed exclusively for test environments.

## Test Data Structure

### Test Users (`001-test-users.sql`)
- **test-user-001**: Regular user with basic access
  - Email: test.user@example.com
  - Role: User
  - Access: Standard features

- **test-admin-001**: Administrator with full access
  - Email: test.admin@example.com
  - Role: Administrator
  - Access: All features including user management

- **test-limited-001**: Limited access user
  - Email: test.limited@example.com
  - Role: User
  - Access: Restricted features for testing permissions

### Test Documents (`002-test-documents.sql`)
- Processed document (PDF)
- Processing document (DOCX)
- Failed document with error
- Document content for search testing

### Test Assistants (`003-test-assistants.sql`)
- Basic assistant for regular user
- Admin assistant for admin user
- Test thread with sample conversation

## Usage in E2E Tests

### Local Development
```bash
# Load test data (run from project root)
psql $DATABASE_URL < infra/database/test-data/001-test-users.sql
psql $DATABASE_URL < infra/database/test-data/002-test-documents.sql
psql $DATABASE_URL < infra/database/test-data/003-test-assistants.sql
```

### Test Isolation Strategy

1. **Transaction Rollback** (Preferred for unit tests)
   ```typescript
   await db.transaction(async (tx) => {
     // Run test
     throw new Error('Rollback'); // Forces rollback
   });
   ```

2. **Cleanup After Test** (For E2E tests)
   ```typescript
   afterEach(async () => {
     // Delete test-created data
     await cleanupTestData(testUserId);
   });
   ```

3. **Test-Specific IDs**
   - All test data uses predictable IDs
   - Prefix: `test-` for easy identification
   - UUIDs for documents to avoid conflicts

## Environment Configuration

### Required Test Environment Variables
```env
# Test Database (separate from production)
TEST_DATABASE_URL=postgresql://user:pass@localhost:5432/testdb

# Test Cognito Users (must match cognito_sub in SQL)
TEST_USER_COGNITO_SUB=test-user-001
TEST_ADMIN_COGNITO_SUB=test-admin-001
TEST_LIMITED_COGNITO_SUB=test-limited-001

# Test S3 Bucket (separate from production)
TEST_S3_BUCKET=my-app-test-documents
```

## Best Practices

1. **Idempotent Scripts**: Use `ON CONFLICT` to make scripts re-runnable
2. **Consistent IDs**: Use predictable IDs for easy reference in tests
3. **Realistic Data**: Include edge cases (failed documents, etc.)
4. **Cleanup**: Always clean up test-created data
5. **Isolation**: Never share test data between tests

## Cleanup Script

To remove all test data:
```sql
-- Delete in reverse order of dependencies
DELETE FROM messages WHERE id LIKE 'test-%';
DELETE FROM threads WHERE id LIKE 'test-%';
DELETE FROM assistants WHERE id LIKE 'test-%';
DELETE FROM document_content WHERE document_id IN (
  SELECT id FROM documents WHERE user_id IN (
    SELECT id FROM users WHERE cognito_sub LIKE 'test-%'
  )
);
DELETE FROM documents WHERE user_id IN (
  SELECT id FROM users WHERE cognito_sub LIKE 'test-%'
);
DELETE FROM user_roles WHERE user_id IN (
  SELECT id FROM users WHERE cognito_sub LIKE 'test-%'
);
DELETE FROM users WHERE cognito_sub LIKE 'test-%';
```