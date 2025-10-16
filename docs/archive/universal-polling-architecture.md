# Universal Polling Architecture

> **⚠️ DEPRECATED - August 2025**
>
> This document describes the Lambda-based polling architecture that was used from deployment until August 2025. This system has been **removed and replaced** with direct ECS streaming (PR #340).
>
> **Current Architecture**: AI streaming now happens directly through ECS containers with HTTP/2 streaming support. There is no longer a polling system, SQS queue, or Lambda workers for streaming operations.
>
> **Migration Details**: See [ADR-003: ECS Streaming Migration](../architecture/ADR-003-ecs-streaming-migration.md)
>
> **Historical Context**: This document is preserved for historical reference and understanding the evolution of the system architecture.

---

## Overview

The Universal Polling Architecture was a critical system that enabled AI Studio to process long-running AI requests asynchronously, overcoming AWS Amplify's strict 30-second timeout limitation. This architecture processed all AI streaming requests through an asynchronous job queue system using SQS and Lambda workers.

## Problem Statement

AWS Amplify enforces a hard 30-second timeout on all HTTP responses, making it impossible to stream AI responses directly to the client for models that take longer to respond. This affects:

- Complex reasoning models (Claude o1, GPT-4o with reasoning)
- Large document processing
- Multi-step tool executions
- Any AI operation requiring more than 30 seconds

## Architecture Overview

```mermaid
graph TB
    Client[Client Application]
    API[/api/nexus/chat]
    Job[(Job Management Service)]
    SQS[SQS Queue]
    Worker[Lambda Worker]
    DB[(PostgreSQL)]
    AIProviders[AI Providers<br/>OpenAI, Bedrock, Google, Azure]

    Client -->|POST /api/nexus/chat| API
    API -->|Create Job| Job
    Job -->|Store Job| DB
    API -->|Queue Message| SQS
    API -->|Return Job ID| Client

    SQS -->|Process Job| Worker
    Worker -->|Get Job Details| DB
    Worker -->|Stream AI Request| AIProviders
    AIProviders -->|Response Stream| Worker
    Worker -->|Update Job Status/Content| DB

    Client -->|Poll Status| PollAPI[/api/nexus/chat/jobs/[jobId]]
    PollAPI -->|Get Job Status| DB
    PollAPI -->|Return Progress| Client

    style Client fill:#e1f5fe
    style API fill:#f3e5f5
    style Worker fill:#e8f5e8
    style DB fill:#fff3e0
    style SQS fill:#fce4ec
```

## Key Components

### 1. Job Creation Endpoint
- **Route**: `/api/nexus/chat/route.ts`
- **Function**: Creates streaming job, stores in database, queues for processing
- **Response**: Returns job ID and polling instructions
- **Timeout**: 30 seconds (within Amplify limits)

### 2. Job Polling Endpoint
- **Route**: `/api/nexus/chat/jobs/[jobId]/route.ts`
- **Function**: Returns job status, partial content, and completion data
- **Features**: Adaptive polling intervals, job cancellation support
- **Caching**: Smart caching based on job status

### 3. Job Management Service
- **Location**: `/lib/streaming/job-management-service.ts`
- **Purpose**: Centralized job lifecycle management
- **Features**: Status tracking, progress updates, cleanup, ownership verification

### 4. SQS Queue System
- **Configuration**: `/lib/aws/queue-config.ts`
- **Queue Name**: `aistudio-{environment}-streaming-jobs-queue`
- **Message Format**: Job ID with metadata attributes
- **Processing**: Lambda workers consume messages asynchronously

### 5. Shared Streaming Core
- **Package**: `/packages/ai-streaming-core/`
- **Purpose**: Universal AI provider abstraction
- **Features**: Multi-provider support, circuit breakers, message conversion

## Request Flow

### 1. Initial Request
```typescript
// Client sends chat request
POST /api/nexus/chat
{
  "messages": [...],
  "modelId": "gpt-4o",
  "provider": "openai",
  "enabledTools": ["search"]
}

// Server responds with job information
{
  "jobId": "uuid-string",
  "conversationId": "uuid-string",
  "status": "pending",
  "pollingInterval": 1000
}
```

### 2. Polling Loop
```typescript
// Client polls for updates
GET /api/nexus/chat/jobs/{jobId}

// Response includes progressive updates
{
  "jobId": "uuid-string",
  "status": "streaming",
  "partialContent": "Current AI response...",
  "shouldContinuePolling": true,
  "pollingInterval": 1000
}
```

### 3. Completion
```typescript
// Final polling response
{
  "jobId": "uuid-string",
  "status": "completed",
  "partialContent": "Full AI response",
  "responseData": {
    "usage": { "totalTokens": 1500 },
    "finishReason": "stop"
  },
  "shouldContinuePolling": false
}
```

## Benefits

### 1. Timeout Resilience
- No 30-second limit on AI processing
- Handles complex reasoning models
- Supports long document processing

### 2. Scalability
- Asynchronous processing prevents blocking
- SQS provides reliable message queuing
- Lambda workers auto-scale with demand

### 3. Reliability
- Circuit breaker pattern prevents cascade failures
- Job retry mechanisms for transient errors
- Graceful error handling and user notification

### 4. User Experience
- Real-time progress updates via polling
- Partial content streaming for immediate feedback
- Job cancellation support

### 5. Cost Efficiency
- Only pay for actual processing time
- Lambda cold start optimization
- Adaptive polling reduces unnecessary requests

## Database Schema

```sql
CREATE TABLE ai_streaming_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id TEXT,                    -- Support both integer and UUID
  user_id INTEGER NOT NULL,
  model_id INTEGER NOT NULL,
  status job_status NOT NULL DEFAULT 'pending',
  request_data JSONB NOT NULL,             -- Original request parameters
  response_data JSONB,                     -- Final response data
  partial_content TEXT,                    -- Progressive content updates
  error_message TEXT,                      -- Error details if failed
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Job status enum: 'pending' | 'running' | 'completed' | 'failed'
CREATE TYPE job_status AS ENUM ('pending', 'running', 'completed', 'failed');
```

## Status Mapping

The system uses a dual-status approach:

### Database Status (job_status enum)
- `pending`: Job queued but not started
- `running`: Job being processed
- `completed`: Job finished successfully
- `failed`: Job failed or cancelled

### Universal Polling Status
- `pending`: Job waiting to start
- `processing`: Job initializing
- `streaming`: Job actively streaming content
- `completed`: Job finished successfully
- `failed`: Job failed due to error
- `cancelled`: Job cancelled by user

## Configuration

### Environment Variables
```bash
# SQS Queue Configuration
STREAMING_JOBS_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/123456789012/aistudio-dev-streaming-jobs-queue

# Database Configuration
RDS_RESOURCE_ARN=arn:aws:rds:us-east-1:123456789012:cluster:aistudio-dev-db
DATABASE_SECRET_ARN=arn:aws:secretsmanager:us-east-1:123456789012:secret:aistudio-dev-db-secret

# AWS Region
NEXT_PUBLIC_AWS_REGION=us-east-1
```

### Queue Configuration
- **Queue Type**: Standard SQS Queue
- **Message Retention**: 14 days
- **Visibility Timeout**: 5 minutes
- **Dead Letter Queue**: Configured for failed processing

## Monitoring and Observability

### Logging
- Structured logging with request IDs
- Job lifecycle tracking
- Performance metrics (latency, tokens)
- Error tracking and categorization

### Metrics
- Job creation rate
- Processing latency by provider
- Success/failure rates
- Queue depth and processing times

### Health Checks
- Queue connectivity
- Database accessibility
- Provider availability
- Lambda function health

## Design Decisions

### Why Polling vs WebSockets?
- **Simplicity**: Easier to implement and debug
- **Reliability**: HTTP polling is more resilient
- **Amplify Compatibility**: No WebSocket infrastructure needed
- **Caching**: HTTP responses can be cached appropriately

### Why SQS vs Direct Processing?
- **Reliability**: SQS provides message durability
- **Scalability**: Decouples request handling from processing
- **Error Handling**: Built-in retry and dead letter queue support
- **Cost**: Only process when needed, not continuously

### Why Database Storage?
- **Persistence**: Jobs survive system restarts
- **Ownership**: User-based access control
- **Audit Trail**: Complete request/response history
- **Cleanup**: Automated expiration and cleanup

## Future Extensions

### Planned Features
- Real-time notifications via Server-Sent Events
- Job prioritization based on user tiers
- Batch job processing for efficiency
- Enhanced telemetry and analytics

### Provider Extensions
- Custom provider adapters
- Multi-model ensemble requests
- Cross-provider fallback logic
- Provider-specific optimizations

## Troubleshooting

### Common Issues

1. **Job Stuck in Pending State**
   - Check SQS queue connectivity
   - Verify Lambda worker deployment
   - Review IAM permissions

2. **Polling Never Completes**
   - Check job status in database
   - Verify error messages
   - Review Lambda logs

3. **High Latency**
   - Monitor provider response times
   - Check database query performance
   - Review SQS message processing

### Debugging Tools
- CloudWatch logs for Lambda workers
- Database query monitoring
- SQS message visibility and metrics
- Application performance monitoring

## Why This Architecture Was Replaced

In August 2025, this polling architecture was replaced with direct ECS streaming for the following reasons:

### Cost Reduction
- Lambda + SQS costs approximately $40/month for polling infrastructure
- Direct ECS streaming eliminates these recurring costs
- Simplified billing with single service

### Latency Improvement
- Polling added 1-5 seconds delay before job starts
- Direct streaming provides immediate response
- Better user experience with real-time feedback

### Architectural Simplicity
- Separate Lambda deployment and monitoring no longer needed
- Fewer moving parts reduces operational complexity
- Unified streaming in single ECS service

### Performance
- Lambda cold starts impacted streaming responsiveness
- ECS provides consistent performance
- Better resource utilization with auto-scaling

**Note**: The `ai_streaming_jobs` table and job management concepts were retained for background processing tasks that don't require real-time streaming (document processing, embeddings generation, scheduled tasks).

---

**Originally Implemented**: Early 2025
**Deprecated**: August 2025 (PR #340)
**Replacement**: Direct ECS streaming (see ADR-003)
**Preserved**: For historical reference and architectural evolution documentation
