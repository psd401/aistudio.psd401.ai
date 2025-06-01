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
├── ui/             # Shadcn UI components
└── features/       # Feature-specific components

actions/            # Server actions for database operations
db/                 # Database schemas and configuration
├── db.ts           # Central database connection
└── schema/         # Schema definitions

lib/                # Core utilities and helpers
tests/              # Test suites
├── unit/           # Unit tests
├── integration/    # Integration tests
└── utils/          # Test utilities
```

## Authentication & Authorization

### Authentication (Clerk)
- User authentication is handled by Clerk
- Protected routes must verify authentication using `currentUser()` from '@clerk/nextjs/server'
- Unauthenticated users are redirected to the sign-in page
- Debug logging should be disabled in middleware to reduce console noise

### Role-Based Access Control
- Two roles: 'Admin' and 'Staff' (default)
- Role hierarchy:
  - Admin: Full access to all features
  - Staff: Access to dashboard and basic features
- Role checks must be performed at both UI and API levels
- Role synchronization between database and Clerk metadata is required
- Case-insensitive role comparison should be used

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
- Always import the database client from `/db/db.ts`
- Always import schema from `/db/schema/index.ts` 
- Follow table naming convention with `Table` suffix in schema (e.g., `usersTable`)
- Use `InsertX` and `SelectX` naming convention for type definitions
- Always use transactions for multi-step operations
- Implement proper error handling and rollbacks

## Components

### NavBar
- Consistent navigation across all pages
- Shows user authentication status using `useUser()` hook
- Role-based visibility of admin links using role check endpoint
- Must maintain responsive design
- Should handle loading and error states gracefully

### UserRoleForm
- Used for role management in admin panel
- Implements proper validation
- Shows loading states during operations
- Handles errors gracefully
- Resets to initial state on error

### UI Components
- Use Shadcn components for consistent design
- Follow Tailwind CSS best practices
- Maintain consistent spacing using Tailwind's spacing system
- Implement proper dark mode support
- Use Shadcn's built-in components where possible
- Implement proper form validation using React Hook Form
- Client-side validation using Zod schema validation

## AI Chat Integration

### Chat Architecture
- Use Vercel AI SDK for real-time chat functionality
- Implement conversation persistence in database
- Support multiple LLM providers through a unified interface

### Database Schema
```sql
Table conversations {
  id        serial    primary key
  clerkId   text      references users(clerkId)
  title     text      not null
  modelId   text      references ai_models(modelId)
  createdAt timestamp default now()
  updatedAt timestamp default now()
}

Table messages {
  id              serial    primary key
  conversationId  integer   references conversations(id)
  role           text      check (role in ('user', 'assistant'))
  content        text      not null
  createdAt      timestamp default now()
}

Table ai_models {
  id          serial    primary key
  name        text      not null
  provider    text      not null
  modelId     text      unique not null
  description text
  capabilities text     # JSON string of model capabilities
  maxTokens   integer
  active      boolean   default true
  createdAt   timestamp default now()
  updatedAt   timestamp
}
```

### Chat Components
- ChatInterface component must:
  - Handle real-time message streaming
  - Support multiple model selection
  - Maintain conversation state
  - Implement proper error handling
  - Show loading states
  - Support message copying
  - Format messages with proper spacing and styling
  - Handle long messages with scrolling
  - Support keyboard shortcuts (Shift+Enter for new lines)

- ConversationsList component must:
  - Show conversation history
  - Support conversation title editing
  - Allow conversation deletion
  - Show active conversation
  - Support creating new conversations
  - Handle empty states

### API Endpoints

#### Chat Messages (/api/chat/messages)
- POST endpoint for sending messages
- Implements:
  - User authentication
  - Conversation creation/updating
  - Message persistence
  - LLM integration
  - Error handling
  - Response streaming

#### Conversations (/api/chat/conversations)
- GET endpoint for listing conversations
- POST endpoint for creating conversations
- DELETE endpoint for removing conversations
- PUT endpoint for updating conversation titles

#### Messages (/api/chat/conversations/[id]/messages)
- GET endpoint for fetching conversation messages
- Implements proper pagination
- Orders messages chronologically

### LLM Integration
- Support multiple LLM providers
- Implement provider-specific adapters
- Handle rate limiting
- Manage API keys securely
- Support streaming responses
- Implement fallback mechanisms
- Monitor token usage

### Testing Requirements
- Test real-time message handling
- Verify conversation persistence
- Test multiple model support
- Validate error scenarios
- Test rate limiting
- Verify message ordering
- Test concurrent conversations
- Validate streaming functionality

## API Endpoints

### User Role Management (/api/admin/users/[userId]/role)
- PUT endpoint for updating user roles
- Requires admin authentication using `currentUser()`
- Validates input data
- Returns appropriate HTTP status codes
- Implements proper error handling
- Syncs roles with Clerk metadata after updates

### Role Check Endpoint (/api/auth/check-role)
- GET endpoint for checking user roles
- Used by client components for role-based UI updates
- Returns boolean indicating if user has specified role
- Implements proper error handling and logging

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

### Standard Error Utilities

Use the following utilities for consistent error handling across the codebase:

- `/types/actions-types.ts` - Contains the `ActionState<T>` type and `AppError` interface
- `/lib/error-utils.ts` - Provides utility functions for error handling
- `/lib/api-utils.ts` - Provides utilities for API route error handling
- `/lib/hooks/use-action.ts` - React hook for handling server actions with error states

### Client-Side
- Use `useAction()` hook to execute server actions with proper error handling
- Show toast notifications for success and error states
- Implement loading states during operations
- Handle network errors gracefully
- Use consistent pattern for error display

### Server-Side
- Server actions must use the standardized utilities:
  ```typescript
  import { createSuccess, handleError, createError } from "@/lib/error-utils";
  
  export async function myAction(data: InputType): Promise<ActionState<OutputType>> {
    try {
      // Perform operations
      return createSuccess(result, "Operation successful");
    } catch (error) {
      return handleError(error, "Operation failed", { context: "myAction" });
    }
  }
  ```

- API routes should use the `withErrorHandling` wrapper:
  ```typescript
  import { withErrorHandling } from "@/lib/api-utils";
  
  export async function GET() {
    return withErrorHandling(async () => {
      // Perform operations
      return data;
    });
  }
  ```

- Use appropriate error codes and levels:
  ```typescript
  throw createError("Resource not found", { 
    code: "NOT_FOUND", 
    level: ErrorLevel.ERROR,
    details: { resourceId: id }
  });
  ```

- Never expose internal error details to clients in production
- Log errors with appropriate context for debugging

### Migration Strategy

To migrate existing code to the new error handling system:

1. Use the automated migration script:
   ```bash
   # Dry run (preview changes)
   npx ts-node scripts/migrate-error-handling.ts --dry-run --all
   
   # Migrate server actions
   npx ts-node scripts/migrate-error-handling.ts --actions
   
   # Migrate API routes
   npx ts-node scripts/migrate-error-handling.ts --api
   ```

2. Manual migration steps:
   - Update imports to include the new error utilities
   - Replace direct ActionState return objects with `createSuccess()`
   - Replace error handling with `handleError()`
   - Refactor complex API routes to use `withErrorHandling()`
   - Update client components to use the `useAction()` hook

3. Testing after migration:
   - Verify error messages are properly displayed
   - Check logs for proper error context
   - Test error scenarios to ensure they are handled correctly

## UI/UX Guidelines

### Page Layout Patterns
- Each major page should follow consistent layout structure
- Common page sections should be organized as:
  ```
  page/
  ├── Header/Title Section
  ├── Main Content Area
  └── Supporting Content
  ```
- Dashboard pages should prioritize:
  - Clear visual hierarchy
  - Responsive design
  - Consistent spacing using Mantine's spacing system
  - Proper component separation

### Component Organization
- Feature sections should be self-contained components
- Components should follow naming convention:
  ```
  components/
  ├── ComponentName.tsx        # Main component file
  └── ComponentName.module.css # Styles for the component
  ```
- Interactive components must include 'use client' directive
- Each component should handle its own:
  - Layout and styling
  - Loading states
  - Error states
  - Responsive behavior

### Component Best Practices
- Use Mantine's built-in components where possible
- Maintain consistent styling with:
  - Proper spacing (mt, mb, mx, my)
  - Consistent color usage
  - Typography hierarchy
- Feature sections should include:
  - Clear titles/headers
  - Descriptive content
  - Proper icon usage
  - Responsive grid layouts
- FAQ/Information sections should use:
  - Accordion components for expandable content
  - Clear section headings
  - Proper content hierarchy
  - Consistent spacing

### Forms
- Use Mantine form components and hooks
- Implement proper validation:
  - Client-side validation using Mantine's form validation
  - Server-side validation for security
  - Clear error messages below fields
- Show loading states:
  - Disable form during submission
  - Show loading indicators
  - Prevent double submissions
- Error handling:
  - Display field-level errors
  - Show form-level error messages
  - Handle network errors gracefully
- Accessibility:
  - Proper label associations
  - Clear error announcements
  - Keyboard navigation support
- State management:
  - Clear initial states
  - Proper form reset functionality
  - Maintain state during async operations
- Layout:
  - Consistent spacing between fields
  - Logical field grouping
  - Responsive design for all screen sizes
  - Clear action buttons (submit, cancel, etc.)

### Components

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

## Feature Documentation

## Political Wording Analysis

### Architecture
- Multi-stage analysis pipeline (Initial, Context, Synthesis)
- Support for multiple AI providers through unified interface
- Context-aware analysis with configurable prompts
- Progress tracking and state management

### Database Schema
```sql
Table political_prompts {
  id          uuid      primary key
  name        text      not null
  description text
  content     text      not null
  stage       text      check (stage in ('initial', 'context', 'synthesis'))
  modelId     integer   references ai_models(id)
  contextId   uuid      references political_contexts(id)
  usesLatimer boolean   default false
  createdAt   timestamp default now()
  updatedAt   timestamp default now()
}

Table political_contexts {
  id          uuid      primary key
  name        text      not null
  description text
  content     text      not null
  createdAt   timestamp default now()
  updatedAt   timestamp default now()
}

Table political_settings {
  id          uuid      primary key
  name        text      not null
  value       text      not null
  createdAt   timestamp default now()
  updatedAt   timestamp default now()
}
```

### Components
- PoliticalWording component must:
  - Handle multi-stage analysis flow
  - Show progress indicators
  - Display results with proper formatting
  - Support markdown rendering
  - Handle loading and error states
  - Maintain analysis state
  - Show model attribution

- Admin components must:
  - Support prompt management for each stage
  - Allow context configuration
  - Enable model selection
  - Support Latimer integration configuration
  - Handle CRUD operations for prompts and contexts
  - Validate configurations

### Analysis Pipeline
- Three-stage analysis:
  1. Initial Analysis: First-pass political sensitivity check
  2. Context Analysis: Deeper analysis with configured context
  3. Synthesis: Combined analysis of previous stages
- Each stage must:
  - Use configured prompts and models
  - Handle errors gracefully
  - Return structured results
  - Support progress tracking

### Server Actions
- Must be placed in the `/actions/` directory
- Follow naming convention with descriptive action names
- Always import database from `/db/db.ts`
- Use schema from `/db/schema/index.ts`
- Must follow ActionState pattern:
  ```typescript
  type ActionState<T> =
    | { isSuccess: true; message: string; data: T }
    | { isSuccess: false; message: string; data?: never }
  ```
- Implement proper error handling with try/catch blocks
- Support transaction rollback
- Validate inputs
- Return appropriate status messages
- Sort actions in CRUD order (Create, Read, Update, Delete)

### Testing Requirements
- Test multi-stage analysis flow
- Verify prompt configurations
- Test context integration
- Validate error scenarios
- Test progress tracking
- Verify result formatting
- Test admin CRUD operations
- Validate model integration

## Conclusion
This specification serves as the foundation for maintaining and extending the application. All new development must follow these guidelines to ensure consistency, reliability, and maintainability of the codebase. Remember: Tests First, Code Second.

### Backend Rules

Follow these rules when working on the backend.

It uses Postgres, Supabase, Drizzle ORM, and Server Actions.

#### General Rules

- Never generate migrations. You do not have to do anything in the `db/migrations` folder inluding migrations and metadata. Ignore it.

#### Long-Running Tasks

The application uses a job-based system for handling long-running tasks:

```sql
Table jobs {
  id          uuid      primary key defaultRandom()
  userId      text      not null
  status      text      check (status in ('pending', 'running', 'completed', 'failed'))
  type        text      not null
  input       text      not null  # JSON string of input data
  output      text                # JSON string of output data
  error       text                # Error message if failed
  createdAt   timestamp default now()
  updatedAt   timestamp default now()
}
```

Job System Features:
- Asynchronous execution of long-running tasks
- Status tracking (pending, running, completed, failed)
- Input/output data persistence
- Error handling and reporting
- User association for access control

Implementation Requirements:
- Use the job system for any task that may take longer than 5 seconds
- Store structured input/output as JSON strings
- Include proper error handling and status updates
- Implement polling with exponential backoff
- Support job result retrieval after completion

Example Job Output Format:
```typescript
interface JobOutput {
  executionId: string
  results: JobPromptResult[]
}

interface JobPromptResult {
  promptId: string
  status: string
  input: any
  output: string
  startTime: string
  endTime?: string
  executionTimeMs: number
}
```

Client Implementation:
- Start with 3-second polling intervals
- Increase to 10-second intervals after 20 retries
- Maximum retry limit of 120 (6 minutes total)
- Show appropriate loading and error states
- Support result retrieval after page reload

#### Organization

// ... existing code ... 