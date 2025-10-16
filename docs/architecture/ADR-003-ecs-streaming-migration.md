# ADR-003: Migrate AI Streaming from Lambda to ECS

## Status
**Implemented** (PR #340, October 2025)

## Context

The application initially used a Lambda-based polling architecture for AI streaming jobs to overcome AWS Amplify's 30-second timeout limitation. However, this introduced operational complexity, cost overhead, and latency due to SQS polling.

### Background

Following the migration from AWS Amplify to ECS Fargate (documented in ADR-002), the system retained Lambda workers for processing AI streaming jobs through an SQS queue. While this worked, it created unnecessary complexity now that ECS can handle streaming directly.

### Problem Statement

The Lambda-based polling architecture introduced several challenges:

1. **Cost Overhead**: Lambda + SQS infrastructure costs approximately $40/month for polling operations
2. **Latency**: SQS polling adds 1-5 second delay before job processing starts
3. **Complexity**: Separate Lambda deployment, build process, and monitoring infrastructure
4. **Performance**: Lambda cold starts impact streaming responsiveness
5. **Redundancy**: ECS already handles streaming; Lambda workers are duplicating functionality

### Technical Details

**Lambda Worker Infrastructure**:
- SQS queue for job distribution (`aistudio-{env}-streaming-jobs-queue`)
- Lambda function processing streaming jobs
- Complex build process requiring compiled TypeScript packages
- Separate deployment pipeline and monitoring

**Execution Flow (Before)**:
```
User Request → Create Job → Queue in SQS → Lambda Polls → Process → Update DB → User Polls
```

**Pain Points**:
- Build complexity: Must compile `@aistudio/streaming-core` and copy to Lambda
- Deployment overhead: Separate CDK stack for Lambda workers
- Monitoring complexity: Multiple CloudWatch log groups to monitor
- Cost: Continuous polling charges even when idle

## Decision

Migrate all AI streaming job processing to **direct ECS execution** with HTTP/2 streaming support, eliminating Lambda workers and SQS queues.

### Rationale

**ECS Advantages**:
- Already running and handling streaming
- No cold start delays
- HTTP/2 streaming support built-in
- Simpler deployment (single application)
- Unified monitoring and logging

**Cost-Benefit Analysis**:
- **Savings**: ~$40/month in Lambda + SQS costs
- **Performance**: 1-5 second latency reduction
- **Complexity**: Simplified architecture with fewer moving parts

## Decision Drivers

### 1. Cost Reduction
- **Lambda costs**: ~$20-25/month for polling workers
- **SQS costs**: ~$15-20/month for message processing
- **Total savings**: ~$40/month (100% reduction in streaming infrastructure costs)

### 2. Performance Improvement
- **Eliminated SQS latency**: No more 1-5 second queue polling delay
- **No cold starts**: ECS containers are always warm
- **Direct streaming**: HTTP/2 streaming provides immediate feedback
- **Reduced roundtrips**: Fewer network hops from request to response

### 3. Architectural Simplification
- **Fewer services**: ECS only (vs ECS + Lambda + SQS)
- **Single deployment**: One CDK stack instead of multiple
- **Unified logging**: Single CloudWatch log group
- **Simpler debugging**: Linear execution path instead of async queues

### 4. Operational Benefits
- **No Lambda builds**: Eliminates complex TypeScript compilation and copying
- **Faster deployments**: Single application deployment vs coordinated Lambda updates
- **Easier monitoring**: One service to monitor instead of three
- **Reduced maintenance**: Fewer infrastructure components to maintain

## Alternatives Considered

### Alternative 1: Keep Lambda Workers, Optimize Performance

**Approach**: Improve Lambda cold start times and optimize SQS polling

**Pros**:
- No migration needed
- Isolated execution environment
- Familiar architecture

**Cons**:
- Doesn't address cost issues
- Still has polling latency
- Complex build process remains
- Multiple services to maintain

**Decision**: Rejected - doesn't solve fundamental problems

### Alternative 2: Hybrid Approach (ECS + Lambda for Long Tasks)

**Approach**: Use ECS for streaming, keep Lambda for tasks >15 minutes

**Pros**:
- Handles very long-running tasks
- ECS for normal streaming
- Lambda isolation for heavy workloads

**Cons**:
- Still need to maintain Lambda infrastructure
- Added complexity of routing logic
- No current use cases requiring >15 minutes

**Decision**: Rejected - can revisit if long-running tasks become common

### Alternative 3: Step Functions for Complex Workflows

**Approach**: Use AWS Step Functions for orchestrating multi-step AI workflows

**Pros**:
- Visual workflow definition
- Built-in error handling and retries
- Supports very long-running tasks

**Cons**:
- Overkill for simple streaming
- Additional AWS service to manage
- Higher complexity for simple use cases

**Decision**: Rejected for now - consider for future complex workflows

## Implementation Details

### Changes Made (PR #340)

#### Removed Components

1. **Lambda Worker Function**
   - `/infra/lambdas/streaming-jobs-worker/` - Entire Lambda directory
   - Build scripts for compiling and copying streaming core package
   - Lambda-specific IAM roles and policies

2. **SQS Infrastructure**
   - `aistudio-{env}-streaming-jobs-queue` - Main processing queue
   - `aistudio-{env}-streaming-jobs-dlq` - Dead letter queue
   - Queue policies and event source mappings

3. **Polling Architecture**
   - `/lib/streaming/universal-polling-adapter.ts` - Client polling logic
   - `/app/api/nexus/chat/jobs/[jobId]/route.ts` - Job status endpoint
   - Job queuing and management complexity

#### Updated Components

1. **Server Actions**
   ```typescript
   // Before: Create job and queue
   export async function executeAssistantArchitectAction(params) {
     const jobId = await createStreamingJob(params)
     await queueJob(jobId)
     return { jobId, status: 'pending' }
   }

   // After: Direct execution
   export async function executeAssistantArchitectAction(params) {
     const result = await executeAssistantArchitect(params)
     return { result, status: 'completed' }
   }
   ```

2. **Streaming Endpoints**
   - Nexus Chat: Direct `streamText` instead of job creation
   - Model Compare: Direct dual streaming
   - Assistant Architect: Direct chain execution

3. **Infrastructure**
   - Removed ProcessingStack (Lambda workers)
   - Simplified FrontendStack (ECS only)
   - Updated environment variables

### Migration Process

**Phase 1: Preparation** (Week 1)
- ✅ Audit all Lambda worker usage
- ✅ Identify dependencies on polling architecture
- ✅ Plan migration for each component

**Phase 2: Code Changes** (Week 1-2)
- ✅ Update Nexus Chat to direct streaming
- ✅ Update Model Compare to direct streaming
- ✅ Update Assistant Architect to direct execution
- ✅ Remove polling client code

**Phase 3: Infrastructure Removal** (Week 2)
- ✅ Remove Lambda worker CDK stack
- ✅ Remove SQS queue infrastructure
- ✅ Clean up environment variables
- ✅ Update deployment documentation

**Phase 4: Testing & Validation** (Week 3)
- ✅ Test all streaming features
- ✅ Verify performance improvements
- ✅ Confirm cost reductions
- ✅ Monitor for issues

**Phase 5: Cleanup** (Week 3-4)
- ✅ Archive old documentation
- ✅ Update architecture diagrams
- ✅ Create ADR-003
- ✅ Remove dead code

## Consequences

### Positive Outcomes

#### Cost Savings
- **Lambda elimination**: $20-25/month saved
- **SQS elimination**: $15-20/month saved
- **Total savings**: ~$40/month (~40% reduction in streaming costs)
- **Ongoing**: No recurring polling infrastructure costs

#### Performance Improvements
| Metric | Before (Lambda) | After (ECS) | Improvement |
|--------|----------------|-------------|-------------|
| **Job start latency** | 1-5 seconds | Immediate | 100% faster |
| **Cold start impact** | 0.5-2 seconds | None | Eliminated |
| **Deployment time** | 5-10 minutes | 3-5 minutes | 40% faster |
| **Monitoring complexity** | 3 services | 1 service | 67% reduction |

#### Operational Benefits
- **Simpler builds**: No TypeScript compilation for Lambda
- **Single deployment**: One application instead of multiple services
- **Unified logging**: Single log group instead of multiple
- **Easier debugging**: Linear execution instead of async queues
- **Reduced maintenance**: Fewer infrastructure components

### Trade-offs and Considerations

#### ECS Resource Usage
- **Impact**: ECS containers now handle all streaming load
- **Mitigation**: Auto-scaling configured to handle traffic spikes
- **Monitoring**: CloudWatch alarms for CPU/memory thresholds
- **Acceptable**: ECS designed for this workload

#### Loss of Isolation
- **Impact**: Streaming executions share ECS container resources
- **Mitigation**: Container resource limits and auto-scaling
- **Risk**: Low - streaming workloads are CPU/memory efficient
- **Acceptable**: Benefits outweigh minimal isolation loss

#### No Native Queuing
- **Impact**: No built-in job queue for backpressure
- **Mitigation**: HTTP/2 connection limits provide natural backpressure
- **Alternative**: Can add SQS later if needed for background tasks
- **Acceptable**: Current traffic doesn't require queueing

### Risks and Mitigations

#### Risk: ECS Overload During Traffic Spikes

**Likelihood**: Low
**Impact**: Medium

**Mitigation**:
- Auto-scaling configured with aggressive scaling policies
- CloudWatch alarms for high CPU/memory usage
- Connection limits prevent resource exhaustion
- Can add queuing layer if traffic patterns change

#### Risk: Longer Streaming Tasks Impact Other Users

**Likelihood**: Low
**Impact**: Low

**Mitigation**:
- HTTP/2 multiplexing allows concurrent streams
- Auto-scaling adds capacity as needed
- Connection timeouts prevent hung requests
- Monitoring for slow requests

#### Risk: Regression in Existing Features

**Likelihood**: Medium (during migration)
**Impact**: High

**Mitigation**:
- Comprehensive testing before deployment
- Gradual rollout with monitoring
- Rollback plan ready
- User communication about changes

**Actual Outcome**: No regressions detected in production

## Success Metrics

### Cost Metrics
- ✅ **Lambda costs**: Reduced from $20-25/month to $0
- ✅ **SQS costs**: Reduced from $15-20/month to $0
- ✅ **Total savings**: ~$40/month achieved
- ✅ **ROI**: Immediate savings with no performance loss

### Performance Metrics
- ✅ **Latency reduction**: 1-5 seconds eliminated
- ✅ **Cold starts**: Eliminated completely
- ✅ **Streaming responsiveness**: Improved noticeably
- ✅ **User experience**: Faster, more responsive streaming

### Operational Metrics
- ✅ **Deployment time**: Reduced by ~40%
- ✅ **Build complexity**: Eliminated Lambda builds
- ✅ **Monitoring**: Simplified to single service
- ✅ **Incident response**: Faster debugging and resolution

## Related Decisions

### ADR-002: Streaming Architecture Migration from AWS Amplify

ADR-002 documented the migration from AWS Amplify to ECS Fargate to enable true HTTP/2 streaming. That migration retained Lambda workers for backward compatibility and incremental migration. ADR-003 completes that migration by removing the now-redundant Lambda polling architecture.

**Relationship**:
- ADR-002: Amplify → ECS (enables streaming)
- ADR-003: Lambda workers → ECS direct execution (simplifies streaming)

### Future Considerations

#### Background Job Processing

The `ai_streaming_jobs` table and job management concepts remain useful for background processing tasks that don't require real-time streaming:

- Document processing and embedding generation
- Scheduled AI tasks and batch operations
- Long-running analysis jobs (>15 minutes)

**Recommendation**: If background job processing becomes common, consider:
- SQS queue for non-streaming background tasks
- Step Functions for complex, long-running workflows
- Keep real-time streaming in ECS (as implemented)

#### Very Long-Running Tasks (>15 minutes)

If use cases emerge requiring tasks longer than ECS timeout limits:

**Option 1: Step Functions**
- Orchestrate multi-step workflows
- Built-in checkpointing and retry
- Email notifications on completion

**Option 2: Batch Processing**
- AWS Batch for heavy computation
- Separate from real-time streaming
- Cost-effective for long tasks

## Implementation References

### Pull Request
- **PR #340**: Remove Lambda streaming workers, migrate to ECS direct execution
- **Epic #305**: Streaming architecture optimization
- **Issue #313**: Refactor Lambda workers to ECS

### Code Changes
- Removed: `/infra/lambdas/streaming-jobs-worker/`
- Removed: `/lib/streaming/universal-polling-adapter.ts`
- Updated: All streaming server actions and API routes
- Updated: Infrastructure CDK stacks

### Documentation Updates
- Archived: `docs/features/universal-polling-architecture.md`
- Updated: `docs/ASSISTANT_ARCHITECT_DEPLOYMENT.md` (renamed, simplified)
- Updated: `docs/operations/streaming-infrastructure.md`
- Updated: `docs/ARCHITECTURE.md` (migration notes)
- Created: This ADR (ADR-003)

## Conclusion

The migration from Lambda workers to ECS direct execution successfully achieved all objectives:

- **Cost**: $40/month savings (100% reduction in streaming infrastructure costs)
- **Performance**: 1-5 second latency reduction, eliminated cold starts
- **Simplicity**: Single service architecture, unified deployment and monitoring
- **Reliability**: No regressions, improved user experience

This decision completes the streaming architecture evolution initiated in ADR-002, resulting in a clean, cost-effective, and performant streaming solution built entirely on ECS Fargate with HTTP/2 streaming.

---

**Decision Date**: October 2025
**Implementation**: PR #340
**Status**: Complete
**Next Review**: When background processing or very long-running task requirements emerge
