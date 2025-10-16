# Assistant Architect Deployment Guide

## Overview

This guide covers the deployment of the Assistant Architect feature, which enables users to create custom AI assistants with multi-step prompt chains. Following the streaming architecture migration (PR #340), Assistant Architect now uses direct ECS execution instead of the previous Lambda-based polling system.

## 🚀 Pre-Deployment Checklist

### ✅ Code Quality & Build Status
- **Linting**: Must pass (`npm run lint`)
- **TypeScript**: Must compile (`npm run typecheck`)
- **Build**: Application must build successfully (`npm run build`)

## 🏗️ Architecture Overview

### Current Architecture (Post-Migration)

Assistant Architect executes directly within the ECS container environment:

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│                 │     │                  │     │                 │
│  User Execution │────▶│  Server Action   │────▶│   ECS Container │
│  (Frontend)     │     │  (Next.js)       │     │   Direct Exec   │
│                 │     │                  │     │                 │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                                                           │
                                                           ▼
                                                  ┌─────────────────┐
                                                  │                 │
                                                  │  AI Providers   │
                                                  │  (OpenAI, etc)  │
                                                  │                 │
                                                  └─────────────────┘
                                                           │
                                                           ▼
                                                  ┌─────────────────┐
                                                  │                 │
                                                  │   PostgreSQL    │
                                                  │   (Results DB)  │
                                                  │                 │
                                                  └─────────────────┘
```

### Execution Flow

1. **User Execution** → Frontend calls `executeAssistantArchitectAction`
2. **Direct Processing** → Server action executes in ECS container
3. **Chain Execution** → Sequential prompt processing with variable substitution
4. **Database Updates** → Real-time updates to `tool_executions` and `prompt_results`
5. **Response Streaming** → HTTP/2 streaming shows progress and results

## 🔧 Deployment Process

### Step 1: Pre-Deployment Validation

```bash
# Navigate to project root
cd /path/to/aistudio.psd401.ai

# Run linting and type checking
npm run lint
npm run typecheck

# Build the application
npm run build
```

### Step 2: Deploy Infrastructure

```bash
# Navigate to infrastructure directory
cd infra

# Deploy all stacks (includes ECS frontend)
npx cdk deploy --all

# Or deploy specific stack
npx cdk deploy AIStudio-FrontendStack-Dev
```

### Step 3: Verify Deployment

```bash
# Check ECS service health
aws ecs describe-services \
  --cluster aistudio-dev-cluster \
  --services aistudio-dev-frontend

# Check application logs
aws logs tail /aws/ecs/aistudio-dev-frontend --follow
```

## 📋 Post-Deployment Testing

### Basic Functionality Test

1. **Create Simple Tool**: Make a 1-prompt Assistant Architect tool
2. **Execute Tool**: Run it and verify it completes
3. **Check Logs**: Monitor ECS logs for successful execution
4. **Verify Database**: Check `tool_executions` table for results

### Chain Execution Test

1. **Create Chain Tool**: Make a 2-prompt tool with variable substitution
   - Prompt 1: "Analyze this: {{user_input}}"
   - Prompt 2: "Summarize: {{prompt_1_output}}"
2. **Execute**: Verify second prompt receives first prompt's output
3. **Database Check**: Verify both prompts saved to `prompt_results` table

### Error Handling Test

1. **Create Invalid Tool**: Tool with malformed prompt or missing model
2. **Execute**: Should fail gracefully
3. **Check**: Verify `tool_executions` marked as `failed`

## 🔍 Monitoring & Debugging

### ECS Container Logs

```bash
# Follow ECS container logs in real-time
aws logs tail /aws/ecs/aistudio-dev-frontend --follow

# Get recent logs with filtering
aws logs filter-log-events \
  --log-group-name /aws/ecs/aistudio-dev-frontend \
  --filter-pattern "assistant-architect"
```

### Database Queries

```sql
-- Recent tool executions
SELECT te.id, te.status, te.started_at, te.completed_at,
       aa.name as tool_name
FROM tool_executions te
JOIN assistant_architects aa ON te.assistant_architect_id = aa.id
ORDER BY te.started_at DESC LIMIT 10;

-- Prompt results for chain execution
SELECT pr.execution_id, pr.prompt_id, pr.status,
       pr.started_at, pr.completed_at,
       LENGTH(pr.output_data) as output_length
FROM prompt_results pr
JOIN tool_executions te ON pr.execution_id = te.id
ORDER BY pr.started_at DESC LIMIT 20;

-- Failed executions with error details
SELECT te.id, aa.name, te.error_message, te.started_at
FROM tool_executions te
JOIN assistant_architects aa ON te.assistant_architect_id = aa.id
WHERE te.status = 'failed'
ORDER BY te.started_at DESC LIMIT 10;
```

### CloudWatch Metrics

Monitor these key metrics in CloudWatch:

- **ECS Service**: CPU utilization, memory usage, task count
- **Application**: Request latency, error rate, execution time
- **Database**: Connection count, query performance

## 🚨 Troubleshooting

### Common Issues

#### 1. Tool Execution Fails Immediately

**Symptoms**: Tool execution returns error without starting

**Possible Causes**:
- Invalid model ID or provider configuration
- Missing required input fields
- Database connection issues

**Resolution**:
```bash
# Check ECS logs for error details
aws logs tail /aws/ecs/aistudio-dev-frontend --follow

# Verify database connectivity
aws rds describe-db-clusters --db-cluster-identifier aistudio-dev-db

# Check model configuration in database
SELECT id, model_id, provider, is_active FROM ai_models;
```

#### 2. Chain Execution Stops at First Prompt

**Symptoms**: First prompt executes but second prompt never runs

**Possible Causes**:
- Variable substitution syntax error
- First prompt output not saved to database
- ECS container timeout or memory issue

**Resolution**:
```sql
-- Check if first prompt output was saved
SELECT pr.execution_id, pr.prompt_id, pr.output_data
FROM prompt_results pr
WHERE pr.execution_id = <execution_id>
ORDER BY pr.prompt_id;
```

#### 3. Slow Execution Performance

**Symptoms**: Tool executions take longer than expected

**Possible Causes**:
- ECS service under-resourced
- Database query performance issues
- AI provider API latency

**Resolution**:
```bash
# Check ECS service scaling
aws ecs describe-services \
  --cluster aistudio-dev-cluster \
  --services aistudio-dev-frontend

# Monitor CloudWatch for resource constraints
aws cloudwatch get-metric-statistics \
  --namespace AWS/ECS \
  --metric-name CPUUtilization \
  --dimensions Name=ServiceName,Value=aistudio-dev-frontend \
  --start-time 2025-01-01T00:00:00Z \
  --end-time 2025-01-02T00:00:00Z \
  --period 3600 \
  --statistics Average
```

## 📝 Migration Summary

### What Changed (PR #340)

**Removed**:
- Lambda worker processing (`/infra/lambdas/streaming-jobs-worker/`)
- SQS queue for job distribution
- Job polling endpoints and infrastructure
- Complex build process for Lambda dependencies

**Updated**:
- `executeAssistantArchitectAction` now executes directly in ECS
- Streaming responses use HTTP/2 instead of polling
- Simplified deployment process (no Lambda builds)
- Direct database access without job queues

**Retained**:
- Database schema (`tool_executions`, `prompt_results`, `assistant_architects`)
- User interface and experience
- Tool configuration and input fields
- Chain prompt syntax and variable substitution logic

### Benefits Achieved

- **Simplicity**: Eliminated complex Lambda build and deployment process
- **Cost**: Reduced infrastructure costs by ~$40/month
- **Performance**: Reduced latency by 1-5 seconds (no SQS polling)
- **Reliability**: Fewer infrastructure components to maintain
- **Consistency**: Aligns with Nexus Chat and Model Compare patterns

## 🔄 Rollback Plan

If Assistant Architect issues are detected after deployment:

### Quick Rollback

```bash
# Redeploy previous version
cd infra
git checkout <previous-working-commit>
npx cdk deploy AIStudio-FrontendStack-Dev
```

### Verify Rollback Success

```bash
# Check ECS service status
aws ecs describe-services \
  --cluster aistudio-dev-cluster \
  --services aistudio-dev-frontend

# Test tool execution
# Execute a known-working Assistant Architect tool via UI

# Monitor logs for errors
aws logs tail /aws/ecs/aistudio-dev-frontend --follow
```

## 📚 Related Documentation

- [ARCHITECTURE.md](./ARCHITECTURE.md) - System architecture overview
- [DEPLOYMENT.md](./DEPLOYMENT.md) - General deployment guide
- [ADR-003](./architecture/ADR-003-ecs-streaming-migration.md) - ECS streaming migration decision
- [operations/streaming-infrastructure.md](./operations/streaming-infrastructure.md) - ECS infrastructure operations

---

**Last Updated**: October 2025
**Migration**: PR #340 - Migrate from Lambda workers to ECS direct execution
**Architecture**: ECS Fargate with HTTP/2 streaming
