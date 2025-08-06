# E2E Test Documentation: User Creation and Name Update Fix

## Overview
This document outlines test scenarios for verifying the fixes implemented in GitHub issue #85:
- New users receive proper first and last names from Cognito
- Existing users' names are updated on login
- Users are assigned correct roles based on username patterns

## Test Environment Requirements
- AWS Cognito user pool with test users configured
- Test users with given_name and family_name attributes set in Cognito
- Access to User Management page (/admin/users)

## Test Scenarios

### Test 1: New Staff User Creation
**Purpose**: Verify that a new user with alphabetic username gets "staff" role and proper names

**Test User**: 
- Username: `teststaff@psd401.net`
- Cognito Attributes:
  - given_name: "John"
  - family_name: "Doe"

**Steps using Playwright MCP**:
```bash
# 1. Clear any existing test user (if needed)
/e2e-test Navigate to /admin/users and check if teststaff@psd401.net exists

# 2. Sign in as new user
/e2e-test Sign out if logged in, then sign in with teststaff@psd401.net credentials

# 3. Verify user creation
/e2e-test Navigate to /admin/users and verify:
- User "John Doe" appears in the Name column
- Email is teststaff@psd401.net
- Role is "Staff" (not "Student")
- Last Login shows recent timestamp
```

**Expected Results**:
- ✅ User shows full name "John Doe" (not just "teststaff")
- ✅ User has "Staff" role automatically assigned
- ✅ No manual intervention required

### Test 2: New Student User Creation
**Purpose**: Verify that a new user with numeric username gets "student" role

**Test User**:
- Username: `123456@psd401.net`
- Cognito Attributes:
  - given_name: "Jane"
  - family_name: "Smith"

**Steps using Playwright MCP**:
```bash
# 1. Sign in as new student user
/e2e-test Sign out and sign in with 123456@psd401.net credentials

# 2. Verify user creation
/e2e-test Navigate to /admin/users and verify:
- User "Jane Smith" appears in the Name column
- Email is 123456@psd401.net
- Role is "Student"
```

**Expected Results**:
- ✅ User shows full name "Jane Smith"
- ✅ User has "Student" role (numeric username pattern)

### Test 3: Existing User Name Update
**Purpose**: Verify that existing users' names get updated on subsequent login

**Prerequisites**:
- Existing user in database with missing or incorrect names
- Update user's given_name and family_name in Cognito

**Steps using Playwright MCP**:
```bash
# 1. Verify current state
/e2e-test Navigate to /admin/users and note the current name for the test user

# 2. Update Cognito attributes (done via AWS Console)
# Set given_name: "Updated"
# Set family_name: "Name"

# 3. Sign in with the user
/e2e-test Sign out and sign in with the test user credentials

# 4. Verify name update
/e2e-test Navigate to /admin/users and verify:
- User now shows "Updated Name" in the Name column
- Role remains unchanged (not reset)
```

**Expected Results**:
- ✅ Name updates to reflect Cognito attributes
- ✅ Role is preserved (not changed on login)
- ✅ Last Login timestamp is updated

### Test 4: User Without Names in Cognito
**Purpose**: Verify graceful fallback when Cognito doesn't provide names

**Test User**:
- Username: `noname@psd401.net`
- Cognito Attributes:
  - given_name: (not set)
  - family_name: (not set)

**Steps using Playwright MCP**:
```bash
# 1. Sign in as user without names
/e2e-test Sign out and sign in with noname@psd401.net

# 2. Verify fallback behavior
/e2e-test Navigate to /admin/users and verify:
- User shows "noname" as first name (email prefix)
- Last name is empty
- Role is "Staff" (alphabetic username)
```

**Expected Results**:
- ✅ System doesn't crash
- ✅ Uses email prefix as fallback for first name
- ✅ Role assignment still works based on username pattern

## Manual Verification Steps

### Database Verification
For thorough testing, verify database directly:

```sql
-- Check a newly created user
SELECT id, cognito_sub, email, first_name, last_name, 
       created_at, updated_at, last_sign_in_at
FROM users 
WHERE email = 'teststaff@psd401.net';

-- Check user role assignment
SELECT u.email, u.first_name, u.last_name, r.name as role_name
FROM users u
JOIN user_roles ur ON u.id = ur.user_id
JOIN roles r ON ur.role_id = r.id
WHERE u.email IN ('teststaff@psd401.net', '123456@psd401.net');
```

### Logging Verification
Check CloudWatch logs for proper logging:
- Look for "Determining default role based on username"
- Verify "staff role assigned to new user" or "student role assigned to new user"
- Check for "Updating user names from Cognito session" for existing users

## Regression Testing

Ensure no existing functionality is broken:
1. Existing users can still log in
2. Manual role changes are preserved
3. User management CRUD operations still work
4. Authentication flow remains unchanged

## Test Data Cleanup

After testing:
```bash
# Remove test users if needed (via admin interface or database)
/e2e-test Navigate to /admin/users and delete test users:
- teststaff@psd401.net
- 123456@psd401.net
- noname@psd401.net
```

## Success Criteria

All tests pass when:
- [ ] New staff users get "Staff" role and full names
- [ ] New student users get "Student" role and full names
- [ ] Existing users' names update on login
- [ ] System handles missing Cognito attributes gracefully
- [ ] No regression in existing functionality
- [ ] Proper logging throughout the process