# AI Streaming Jobs Worker Lambda

## Overview

This Lambda function processes AI streaming jobs from the SQS queue as part of the universal polling architecture to overcome AWS Amplify's 30-second timeout limitation.

## Implementation Notes

The current implementation includes a mock AI processing function. To complete the integration with the unified streaming service, the following steps are needed:

### 1. TypeScript Conversion

Convert the Lambda to TypeScript to utilize the existing unified streaming service:

```bash
cd infra/lambdas/streaming-jobs-worker
npm install typescript @types/node
npm install ai @ai-sdk/openai @ai-sdk/google @ai-sdk/amazon-bedrock @ai-sdk/azure
```

### 2. Import Unified Streaming Service

Replace the mock `processStreamingJob` function with actual unified streaming service integration:

```typescript
import { unifiedStreamingService } from '../../../lib/streaming/unified-streaming-service';
import { createProviderModelWithCapabilities } from '../../../app/api/chat/lib/provider-factory';
import type { StreamRequest } from '../../../lib/streaming/types';
```

### 3. Real AI Processing Implementation

The `processStreamingJob` function should:

1. Create a StreamRequest object from job data
2. Set up progress callbacks to update job status in database
3. Call `unifiedStreamingService.stream()` with the request
4. Handle streaming updates progressively
5. Save final response to database

### 4. Error Handling

Implement proper error handling for:
- AI provider API failures
- Network timeouts
- Model-specific errors
- Database update failures

### 5. Environment Configuration

Add environment variables for AI provider configurations:
- OpenAI API keys
- Google AI API keys
- AWS Bedrock configuration
- Azure OpenAI configuration

### 6. Monitoring and Logging

Enhanced logging for:
- Job processing duration
- AI provider latency
- Error rates by provider/model
- Queue depth monitoring

## Current Functionality

The mock implementation demonstrates the complete job processing flow:

1. ✅ Job retrieval from database
2. ✅ Job status updates (pending → processing → streaming → completed/failed)
3. ✅ Progressive content updates
4. ✅ Error handling and cleanup
5. ✅ SQS integration

## Testing

The mock implementation can be tested by:

1. Creating a job via `/api/chat`
2. Monitoring job status via `/api/chat/jobs/{jobId}`
3. Observing progressive updates in the database
4. Verifying final completion status

## Production Deployment

For production deployment:

1. Convert to TypeScript
2. Implement real AI streaming integration
3. Add comprehensive error handling
4. Configure AI provider credentials
5. Set up monitoring and alerting
6. Test with all supported model types
7. Performance optimization for high throughput

## Performance Characteristics

Current mock implementation simulates:
- 5-20 second processing time
- Progressive updates every 1 second
- Realistic token usage metrics
- Proper job lifecycle management

Real implementation will provide:
- Variable processing time based on model capabilities
- Real-time streaming updates
- Accurate usage tracking
- Provider-specific optimizations