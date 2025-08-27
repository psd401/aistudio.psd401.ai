# Assistant Architect Lambda Migration - Deployment Guide

## Overview

This guide covers the deployment of the Assistant Architect Lambda migration from local processing to universal polling architecture. This migration aligns Assistant Architect with the modern patterns used by Nexus Chat and Model Compare.

## 🚀 Pre-Deployment Checklist

### ✅ Code Quality & Build Status
- **Linting**: Must pass (`npm run lint`)
- **TypeScript**: Must compile (`npm run typecheck`)
- **Streaming Core**: Must be built and copied to Lambda worker
- **Dependencies**: Must be installed in Lambda worker

### ✅ Critical Build Steps

The Lambda worker depends on a local `@aistudio/streaming-core` package that must be compiled from TypeScript and copied into the Lambda's directory structure.

## 🔧 Complete Build & Deployment Process

### Step 1: Clean and Rebuild Everything

```bash
# Navigate to project root
cd /path/to/aistudio.psd401.ai

# Clean any existing builds
rm -rf packages/ai-streaming-core/dist
rm -rf infra/lambdas/streaming-jobs-worker/packages/ai-streaming-core/dist/*
rm -rf infra/lambdas/streaming-jobs-worker/node_modules

# Build the main streaming core package
cd packages/ai-streaming-core
npm run clean  # if available
npm run build

# Verify build succeeded
ls -la dist/  # Should contain .js, .d.ts, and .js.map files

# Return to project root
cd ../..
```

### Step 2: Copy Streaming Core to Lambda

```bash
# Copy all compiled artifacts to Lambda's package
cp -r packages/ai-streaming-core/dist/* infra/lambdas/streaming-jobs-worker/packages/ai-streaming-core/dist/

# Copy package.json as well
cp packages/ai-streaming-core/package.json infra/lambdas/streaming-jobs-worker/packages/ai-streaming-core/

# Verify files were copied correctly
ls -la infra/lambdas/streaming-jobs-worker/packages/ai-streaming-core/dist/
# Should show: index.js, provider-factory.js, unified-streaming-service.js, etc.
```

### Step 3: Install Lambda Dependencies

```bash
# Navigate to Lambda directory and install dependencies
cd infra/lambdas/streaming-jobs-worker
npm install

# Verify the local streaming core package is linked
npm list @aistudio/streaming-core
# Should show: @aistudio/streaming-core@1.0.0 -> file:../../../packages/ai-streaming-core
```

### Step 4: Commit Build Artifacts (Important!)

```bash
# Return to project root
cd /path/to/aistudio.psd401.ai

# Stage the Lambda's streaming core package
git add infra/lambdas/streaming-jobs-worker/packages/ai-streaming-core/

# Commit the build artifacts
git commit -m "build: prepare Lambda worker with compiled streaming core package

- Built main streaming-core package from TypeScript sources
- Copied compiled artifacts to Lambda's packages/ai-streaming-core/dist/
- Updated package.json in Lambda's streaming-core copy
- Refreshed node_modules to link local streaming core properly"
```

### Step 5: Deploy to AWS

```bash
# Navigate to infrastructure directory
cd infra

# Deploy the Processing Stack (contains the Lambda worker)
npx cdk deploy AIStudio-ProcessingStack-Dev

# Or deploy all stacks if needed
npx cdk deploy --all
```

## 🛠️ Troubleshooting Build Issues

### If "Module not found: @aistudio/streaming-core"

```bash
# Complete rebuild process:
cd packages/ai-streaming-core
rm -rf dist node_modules
npm install
npm run build

# Re-copy to Lambda
cd ../../
rm -rf infra/lambdas/streaming-jobs-worker/packages/ai-streaming-core/dist
cp -r packages/ai-streaming-core/dist infra/lambdas/streaming-jobs-worker/packages/ai-streaming-core/
cp packages/ai-streaming-core/package.json infra/lambdas/streaming-jobs-worker/packages/ai-streaming-core/

# Reinstall Lambda dependencies
cd infra/lambdas/streaming-jobs-worker
rm -rf node_modules package-lock.json
npm install
```

### If Lambda Import Still Fails

```bash
# Check what's actually in the Lambda's streaming core
ls -la infra/lambdas/streaming-jobs-worker/packages/ai-streaming-core/dist/
# Should contain: index.js, index.d.ts, unified-streaming-service.js, etc.

# Verify the package.json points to the right main file
cat infra/lambdas/streaming-jobs-worker/packages/ai-streaming-core/package.json
# Should show: "main": "dist/index.js"

# Test the import locally
cd infra/lambdas/streaming-jobs-worker
node -e "console.log(require('@aistudio/streaming-core'))"
# Should not throw errors
```

### If Build Process Changes in the Future

Create an automated build script at `/infra/build-streaming-worker.sh`:

```bash
#!/bin/bash
set -e

echo "Building streaming jobs worker with dependencies..."

# Build main streaming core
echo "Building main streaming core package..."
cd packages/ai-streaming-core
npm run build
cd ../..

# Copy to Lambda
echo "Copying streaming core to Lambda worker..."
rm -rf infra/lambdas/streaming-jobs-worker/packages/ai-streaming-core/dist/*
cp -r packages/ai-streaming-core/dist/* infra/lambdas/streaming-jobs-worker/packages/ai-streaming-core/dist/
cp packages/ai-streaming-core/package.json infra/lambdas/streaming-jobs-worker/packages/ai-streaming-core/

# Install Lambda dependencies
echo "Installing Lambda dependencies..."
cd infra/lambdas/streaming-jobs-worker
npm install

echo "Streaming worker build complete!"
```

Then run: `chmod +x infra/build-streaming-worker.sh && ./infra/build-streaming-worker.sh`

## 📋 Post-Deployment Testing

### Basic Functionality Test

1. **Create Simple Tool**: Make a 1-prompt Assistant Architect tool
2. **Execute Tool**: Run it and verify it completes
3. **Check Logs**: Monitor Lambda logs for successful execution

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

### Lambda Logs
```bash
# Follow Lambda worker logs in real-time
aws logs tail /aws/lambda/AIStudio-ProcessingStack-Dev-StreamingJobsWorker --follow

# Get recent logs  
aws logs describe-log-groups --log-group-name-prefix "/aws/lambda/AIStudio-ProcessingStack"
```

### SQS Queue Monitoring
- **AWS Console** → SQS → `aistudio-dev-streaming-jobs-queue`
- Monitor messages in flight and dead letter queue
- Check message attributes for proper job routing

### Database Queries
```sql
-- Recent streaming jobs
SELECT id, status, created_at, request_data->>'source' as source 
FROM ai_streaming_jobs 
WHERE request_data->>'source' = 'assistant-architect'
ORDER BY created_at DESC LIMIT 10;

-- Tool execution status
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
```

## 🎯 Expected Architecture Flow

1. **User Execution** → Frontend calls `executeAssistantArchitectAction`
2. **Job Creation** → Creates streaming job with `source: 'assistant-architect'`
3. **SQS Queue** → Job sent to `aistudio-dev-streaming-jobs-queue`
4. **Lambda Processing** → Worker detects Assistant Architect job type
5. **Chain Execution** → Sequential prompt processing with variable substitution
6. **Database Updates** → Real-time updates to `tool_executions` and `prompt_results`
7. **Frontend Polling** → Universal polling shows progress and results

## 🚨 Rollback Plan

If deployment fails or Assistant Architect stops working:

### Quick Rollback
```bash
# Deploy previous version of Lambda
cd infra
npx cdk deploy AIStudio-ProcessingStack-Dev --previous-parameters

# Or redeploy with working commit
git checkout <previous-working-commit>
./infra/build-streaming-worker.sh  # if script exists
npx cdk deploy AIStudio-ProcessingStack-Dev
```

### Emergency Fix
```bash
# Disable Lambda processing temporarily
aws lambda put-function-configuration \
  --function-name AIStudio-ProcessingStack-Dev-StreamingJobsWorker \
  --environment Variables='{"DISABLE_ASSISTANT_ARCHITECT":"true"}'

# Jobs will queue but not process until re-enabled
```

## 📝 Migration Summary

### What Changed
- **Backend**: `executeAssistantArchitectAction` creates streaming jobs instead of local execution
- **Lambda**: Added `processAssistantArchitectJob()` with chain prompt support
- **Frontend**: Pure universal polling, removed mixed execution paths
- **Database**: Same schema, different execution flow

### What Stayed the Same
- Database schema (`tool_executions`, `prompt_results`, `assistant_architects`)
- User interface and experience
- Tool configuration and input fields
- Chain prompt syntax and variable substitution logic

### Benefits Achieved
- **Consistency**: Aligns with Nexus Chat and Model Compare patterns
- **Scalability**: All AI processing through Lambda workers
- **Reliability**: Eliminates local processing timeouts
- **Observability**: Centralized logging and job monitoring

---

**Last Updated**: August 2025  
**Migration**: Issue #206 - Migrate Assistant Architect to Lambda-based universal polling architecture