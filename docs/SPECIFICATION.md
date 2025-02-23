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
- Always use transactions for multi-step operations
- Implement proper error handling and rollbacks
- Follow the existing patterns in `lib/db.ts`

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

## Communication Analysis

### Architecture
- Uses Vercel AI SDK for unified AI provider integration
- Supports multiple providers (Azure OpenAI, Amazon Bedrock, Google) through a single interface
- Implements audience-specific analysis with persona context
- Supports meta-analysis across all audiences

### Database Schema
```sql
Table communication_settings {
  id            uuid      primary key
  minimumRole   text      check (minimumRole in ('administrator', 'staff', 'student'))
  createdAt     timestamp default now()
  updatedAt     timestamp default now()
}

Table communication_audiences {
  id          uuid      primary key
  name        text      not null
  description text      # Stores audience persona
  createdAt   timestamp default now()
  updatedAt   timestamp default now()
}

Table communication_analysis_prompts {
  id            uuid      primary key
  audienceId    uuid      references communication_audiences(id)
  modelId       integer   references ai_models(id)
  prompt        text      not null
  isMetaAnalysis boolean  default false
  createdAt     timestamp default now()
  updatedAt     timestamp default now()
}

Table communication_analysis_results {
  id                uuid      primary key
  userId           text      not null
  originalMessage   text      not null
  audienceId       uuid      references communication_audiences(id)
  feedback         text      not null
  suggestedRevisions text
  metaAnalysis     text
  modelId          integer   references ai_models(id)
  promptId         uuid      references communication_analysis_prompts(id)
  createdAt        timestamp default now()
  updatedAt        timestamp default now()
}

Table communication_access_control {
  id           uuid      primary key
  userId       text      not null
  accessLevel  text      check (accessLevel in ('administrator', 'staff', 'student'))
  createdAt    timestamp default now()
  updatedAt    timestamp default now()
}

Table communication_audience_configs {
  id          uuid      primary key
  audienceId  uuid      references communication_audiences(id)
  modelId     integer   references ai_models(id)
  createdAt   timestamp default now()
  updatedAt   timestamp default now()
}
```

### AI Model Integration
- Unified interface through `lib/ai-helpers.ts`
- Provider-specific configuration:
  ```typescript
  // Azure OpenAI
  const azureClient = createAzure({
    apiKey: process.env.AZURE_OPENAI_KEY,
    resourceName: process.env.AZURE_OPENAI_RESOURCENAME
  })

  // Amazon Bedrock
  const bedrock = createAmazonBedrock({
    region: process.env.BEDROCK_REGION,
    accessKeyId: process.env.BEDROCK_ACCESS_KEY_ID,
    secretAccessKey: process.env.BEDROCK_SECRET_ACCESS_KEY
  })

  // Google AI
  process.env.GOOGLE_GENERATIVE_AI_API_KEY = process.env.GOOGLE_API_KEY
  const googleModel = google(modelConfig.modelId)
  ```

### Components
- CommunicationAnalysis: Main component handling message input and analysis display
- Supports:
  - Multiple audience analysis
  - Meta-analysis across all audiences
  - Real-time analysis with loading states
  - Markdown rendering of analysis results
  - Error handling and user feedback

### API Endpoints

#### Analysis (/api/communication-analysis/analyze)
- POST endpoint for analyzing messages
- Implements:
  - Audience-specific analysis
  - Meta-analysis across audiences
  - Provider selection based on configuration
  - Error handling and validation
  - Response formatting

#### Settings (/api/communication-analysis/settings)
- GET/PUT endpoints for managing analysis settings
- Controls:
  - Minimum role requirements
  - Provider configurations
  - Audience management

### Environment Variables
Required variables for each provider:
```env
# Azure OpenAI
AZURE_OPENAI_KEY=
AZURE_OPENAI_ENDPOINT=
AZURE_OPENAI_RESOURCENAME=

# AWS Bedrock
BEDROCK_ACCESS_KEY_ID=
BEDROCK_SECRET_ACCESS_KEY=
BEDROCK_REGION=

# Google AI
GOOGLE_API_KEY=
```

### Testing Requirements
- Test analysis functionality for each provider
- Verify audience persona integration
- Test meta-analysis capabilities
- Validate error handling
- Test concurrent analysis requests
- Verify proper provider selection
- Test markdown rendering
- Validate environment configuration

## Conclusion
This specification serves as the foundation for maintaining and extending the application. All new development must follow these guidelines to ensure consistency, reliability, and maintainability of the codebase. Remember: Tests First, Code Second. 