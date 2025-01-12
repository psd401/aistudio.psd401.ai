# Enterprise App Template Specification

## Overview
This is a Next.js enterprise application template that implements role-based access control (RBAC) using Clerk for authentication and PostgreSQL with Drizzle ORM for data persistence. The application follows a test-driven development (TDD) approach and implements best practices for enterprise-grade applications.

## Core Principles

### Test-Driven Development (TDD)
- **All new features MUST have tests written before implementation**
- Tests should cover:
  - Unit tests for individual components and functions
  - Integration tests for API endpoints
  - Database schema and operations
  - Authentication and authorization flows
  - Edge cases and error handling

### Code Organization
```
app/
├── api/            # API routes
├── admin/          # Admin panel
├── dashboard/      # User dashboard
├── page.tsx        # Home page
└── layout.tsx      # Root layout

components/         # Reusable UI components
lib/               # Core utilities and database
tests/             # Test suites
├── unit/          # Unit tests
├── integration/   # Integration tests
└── utils/         # Test utilities
```

## Authentication & Authorization

### Authentication (Clerk)
- User authentication is handled by Clerk
- Protected routes must verify authentication using `auth()` from '@clerk/nextjs'
- Unauthenticated users are redirected to the home page

### Role-Based Access Control
- Three roles: 'Admin', 'Staff' (default), and 'User'
- Role hierarchy:
  - Admin: Full access to all features
  - Staff: Access to dashboard and basic features
  - User: Limited access (future implementation)
- Role checks must be performed at both UI and API levels

## Database Schema

### Users Table
```sql
Table users {
  id      serial    primary key
  clerkId text      unique not null
  role    text      not null default 'Staff'
}
```

### Database Operations
- Use Drizzle ORM for all database operations
- Always use transactions for multi-step operations
- Implement proper error handling and rollbacks
- Follow the existing patterns in `lib/db.ts`

## Components

### NavBar
- Consistent navigation across all pages
- Shows user authentication status
- Role-based visibility of admin links
- Must maintain responsive design

### UserRoleForm
- Used for role management in admin panel
- Implements proper validation
- Shows loading states during operations
- Handles errors gracefully

## API Endpoints

### User Role Management (/api/users/role)
- PUT endpoint for updating user roles
- Requires admin authentication
- Validates input data
- Returns appropriate HTTP status codes
- Implements proper error handling

## Testing Requirements

### Unit Tests
- Components must have tests for:
  - Rendering
  - User interactions
  - Props validation
  - Error states
  - Loading states

### Integration Tests
- API endpoints must have tests for:
  - Success cases
  - Authentication
  - Authorization
  - Input validation
  - Error handling
  - Database interactions

### Test Coverage
- All new code must have:
  - Unit tests
  - Integration tests where applicable
  - Edge case coverage
  - Error handling coverage

## Development Workflow

### Adding New Features
1. Write tests first:
   ```typescript
   describe('New Feature', () => {
     it('should behave in expected way', () => {
       // Test implementation
     });
   });
   ```
2. Implement the feature
3. Ensure all tests pass
4. Add documentation
5. Submit for review

### Modifying Existing Features
1. Ensure existing tests pass
2. Add new tests for new functionality
3. Modify implementation
4. Verify all tests pass
5. Update documentation

## Error Handling

### Client-Side
- Use try-catch blocks for async operations
- Show appropriate error messages to users
- Implement loading states during operations
- Handle network errors gracefully

### Server-Side
- Return appropriate HTTP status codes
- Provide meaningful error messages
- Log errors for debugging
- Never expose internal error details to clients

## UI/UX Guidelines

### Components
- Use Mantine UI components
- Maintain consistent styling
- Implement proper loading states
- Show error messages clearly
- Follow accessibility best practices

### Forms
- Implement proper validation
- Show loading states
- Clear error messages
- Disable submit during processing

## Security Requirements

### Authentication
- All protected routes must verify auth
- Implement proper session handling
- Follow Clerk security best practices

### Authorization
- Check user roles for protected actions
- Implement role checks at API level
- Validate all user input
- Prevent unauthorized access

## Performance Guidelines

### Database
- Use proper indexes
- Optimize queries
- Implement pagination where needed
- Cache frequently accessed data

### API
- Implement rate limiting
- Use proper HTTP methods
- Return minimal required data
- Handle concurrent requests properly

## Future Development

### Before Adding Features
1. Create detailed test specifications
2. Write tests covering all aspects:
   - Unit tests
   - Integration tests
   - Edge cases
   - Error scenarios
3. Get test approval
4. Implement feature
5. Ensure all tests pass
6. Update documentation

### Maintaining Code Quality
- Follow existing patterns
- Maintain test coverage
- Update documentation
- Consider performance implications
- Follow security best practices

## Documentation

### Code Comments
- Document complex logic
- Explain business rules
- Note security considerations
- Document assumptions

### API Documentation
- Document all endpoints
- Include request/response examples
- Note authentication requirements
- Document error responses

## Deployment

### Environment Variables
Required variables:
```
DATABASE_URL=postgresql://...
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...
CLERK_SECRET_KEY=sk_...
```

### Database Migrations
- Use Drizzle for migrations
- Test migrations before deployment
- Have rollback plans
- Document migration steps

## Conclusion
This specification serves as the foundation for maintaining and extending the application. All new development must follow these guidelines to ensure consistency, reliability, and maintainability of the codebase. Remember: Tests First, Code Second. 