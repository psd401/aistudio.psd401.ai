# Lambda Optimization Migration Guide

This guide explains how to migrate existing Lambda functions to use the new `OptimizedLambda` construct.

## Overview

The `OptimizedLambda` construct provides:
- **AWS Lambda PowerTuning** integration for right-sizing
- **Graviton2 (ARM64)** for 40% better price/performance
- **Intelligent esbuild bundling** with tree-shaking
- **X-Ray tracing** and CloudWatch Insights
- **Provisioned & reserved concurrency** management
- **Performance monitoring** dashboard
- **Cost tracking** with detailed tags

## Quick Start

### Before (Standard Lambda)

```typescript
const processor = new lambda.Function(this, 'StandardProcessor', {
  functionName: `AIStudio-DocumentProcessor-Standard-${environment}`,
  runtime: lambda.Runtime.NODEJS_20_X,
  handler: 'dist/index.handler',
  code: lambda.Code.fromAsset('lambdas/document-processor-v2'),
  memorySize: 3008,
  timeout: cdk.Duration.minutes(15),
  environment: {
    DOCUMENTS_BUCKET_NAME: this.documentsBucket.bucketName,
    // ... other env vars
  },
});
```

### After (OptimizedLambda)

```typescript
import { OptimizedLambda, EnvironmentConfig } from '../constructs';

const config = EnvironmentConfig.get(environment);

const processor = new OptimizedLambda(this, 'StandardProcessor', {
  functionName: `aistudio-doc-processor-${environment}`,
  handler: 'index.handler', // esbuild bundles to single file
  codePath: 'lambdas/document-processor-v2',
  config,

  // Performance profile determines optimization strategy
  performanceProfile: 'standard',

  // PowerTuning configuration (run first, then apply results)
  powerTuning: {
    enabled: true,
    targetCost: 'balanced',
    // After tuning, add results here:
    // tunedMemorySize: 1536,
    // tunedTimeout: cdk.Duration.minutes(3),
  },

  // ARM64 enabled by default
  enableGraviton: true,

  // Optimized bundling with esbuild (default for Node.js)
  enableOptimizedBundling: true,

  // Environment variables
  environment: {
    DOCUMENTS_BUCKET_NAME: this.documentsBucket.bucketName,
    // ... other env vars
  },
});

// Grant permissions as before
this.documentsBucket.grantReadWrite(processor.function);
```

## Migration Steps

### Step 1: Run PowerTuning

Before migrating, run PowerTuning to determine optimal memory configuration:

```bash
# Deploy PowerTuning State Machine
cd infra
npx cdk deploy AIStudio-PowerTuning-Dev

# Run tuning for existing function
aws stepfunctions start-execution \
  --state-machine-arn "arn:aws:states:us-east-1:ACCOUNT:stateMachine:lambda-power-tuning-dev" \
  --input '{
    "lambdaARN": "arn:aws:lambda:us-east-1:ACCOUNT:function:AIStudio-DocumentProcessor-Standard-dev",
    "powerValues": [128, 256, 512, 1024, 1536, 2048, 3008],
    "num": 10,
    "payload": {},
    "strategy": "balanced"
  }'

# Check results (wait for execution to complete)
aws stepfunctions describe-execution \
  --execution-arn "EXECUTION_ARN"
```

### Step 2: Update Stack to Use OptimizedLambda

Example migration for `document-processing-stack.ts`:

```typescript
import {
  OptimizedLambda,
  EnvironmentConfig,
  LambdaCostDashboard,
} from './constructs';

export class DocumentProcessingStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: DocumentProcessingStackProps) {
    super(scope, id, props);

    const config = EnvironmentConfig.get(props.environment);

    // Standard processor with PowerTuning results
    this.standardProcessor = new OptimizedLambda(this, 'StandardProcessor', {
      functionName: `aistudio-doc-processor-${props.environment}`,
      handler: 'index.handler',
      codePath: 'lambdas/document-processor-v2',
      config,

      performanceProfile: 'standard',
      powerTuning: {
        enabled: true,
        tunedMemorySize: 1536, // From PowerTuning results
        tunedTimeout: cdk.Duration.minutes(5),
      },

      // Reserved concurrency to prevent throttling
      concurrency: {
        reserved: 10,
      },

      environment: {
        DOCUMENTS_BUCKET_NAME: this.documentsBucket.bucketName,
        DOCUMENT_JOBS_TABLE: this.documentJobsTable.tableName,
        HIGH_MEMORY_QUEUE_URL: this.highMemoryQueue.queueUrl,
        DLQ_URL: this.processingDLQ.queueUrl,
        DATABASE_RESOURCE_ARN: props.rdsClusterArn,
        DATABASE_SECRET_ARN: props.rdsSecretArn,
        DATABASE_NAME: 'aistudio',
      },
    });

    // High-memory processor with batch profile
    this.highMemoryProcessor = new OptimizedLambda(this, 'HighMemoryProcessor', {
      functionName: `aistudio-doc-processor-heavy-${props.environment}`,
      handler: 'index.handler',
      codePath: 'lambdas/document-processor-v2',
      config,

      performanceProfile: 'batch',
      powerTuning: {
        enabled: true,
        tunedMemorySize: 3008, // Reduced from 10GB after tuning
        tunedTimeout: cdk.Duration.minutes(10),
      },

      // Lower concurrency for expensive operations
      concurrency: {
        reserved: 2,
      },

      environment: {
        DOCUMENTS_BUCKET_NAME: this.documentsBucket.bucketName,
        DOCUMENT_JOBS_TABLE: this.documentJobsTable.tableName,
        DLQ_URL: this.processingDLQ.queueUrl,
        PROCESSOR_TYPE: 'HIGH_MEMORY',
        DATABASE_RESOURCE_ARN: props.rdsClusterArn,
        DATABASE_SECRET_ARN: props.rdsSecretArn,
        DATABASE_NAME: 'aistudio',
      },
    });

    // Grant permissions (using .function property to access underlying Lambda)
    this.documentsBucket.grantReadWrite(this.standardProcessor.function);
    this.documentsBucket.grantReadWrite(this.highMemoryProcessor.function);
    this.documentJobsTable.grantReadWriteData(this.standardProcessor.function);
    this.documentJobsTable.grantReadWriteData(this.highMemoryProcessor.function);

    // Add SQS event sources as before
    this.standardProcessor.function.addEventSource(
      new eventsources.SqsEventSource(this.processingQueue, {
        batchSize: 5,
        maxConcurrency: 10,
        reportBatchItemFailures: true,
      })
    );

    this.highMemoryProcessor.function.addEventSource(
      new eventsources.SqsEventSource(this.highMemoryQueue, {
        batchSize: 1,
        maxConcurrency: 2,
        reportBatchItemFailures: true,
      })
    );

    // Add cost monitoring dashboard
    new LambdaCostDashboard(this, 'CostDashboard', {
      environment: props.environment,
      functions: [
        this.standardProcessor.function,
        this.highMemoryProcessor.function,
      ],
    });
  }
}
```

### Step 3: Update Lambda Code for esbuild

Since `OptimizedLambda` uses esbuild bundling, update your Lambda code structure:

**Before:**
```
lambdas/document-processor-v2/
├── src/
│   └── index.ts
├── dist/
│   └── index.js
├── package.json
└── tsconfig.json
```

**After (esbuild-friendly):**
```
lambdas/document-processor-v2/
├── index.ts          # Entry point at root
├── lib/              # Helper modules
│   ├── parser.ts
│   └── s3-client.ts
├── package.json
└── tsconfig.json
```

**Entry point (`index.ts`):**
```typescript
// index.ts - must export handler at root level
import { SQSEvent } from 'aws-lambda';
import { processDocument } from './lib/parser';

export const handler = async (event: SQSEvent) => {
  // Your handler logic
};
```

### Step 4: Deploy and Validate

```bash
# Deploy updated stack
cd infra
npx cdk deploy AIStudio-DocumentProcessingStack-Dev

# Validate deployment
aws lambda get-function-configuration \
  --function-name aistudio-doc-processor-dev \
  --query '[FunctionName,MemorySize,Timeout,Architectures,TracingConfig]'

# Check tags
aws lambda list-tags \
  --resource arn:aws:lambda:us-east-1:ACCOUNT:function:aistudio-doc-processor-dev

# View cost dashboard
# Navigate to CloudWatch > Dashboards > lambda-cost-dev
```

## Performance Profiles

### Critical Profile
Best for: API endpoints, real-time processing, user-facing operations

```typescript
performanceProfile: 'critical',
concurrency: {
  reserved: 10,
  provisioned: 2,
  autoScaling: {
    minCapacity: 2,
    maxCapacity: 10,
    targetUtilization: 0.7,
  },
},
enableProfiling: true,
```

**Characteristics:**
- Higher memory allocation
- Provisioned concurrency (reduces cold starts)
- Auto-scaling enabled
- Longer log retention
- Dead letter queue enabled
- Code profiling enabled

### Standard Profile
Best for: Background processing, scheduled tasks, moderate workloads

```typescript
performanceProfile: 'standard',
concurrency: {
  reserved: 5,
},
```

**Characteristics:**
- Balanced memory allocation
- Reserved concurrency
- Standard logging
- Cost-optimized

### Batch Profile
Best for: Large file processing, data transformation, infrequent heavy workloads

```typescript
performanceProfile: 'batch',
concurrency: {
  reserved: 2,
},
powerTuning: {
  tunedMemorySize: 3008,
  tunedTimeout: cdk.Duration.minutes(15),
},
```

**Characteristics:**
- High memory allocation
- Longer timeout
- Lower concurrency
- Optimized for throughput over latency

## Cost Savings Examples

### Document Processing Stack Migration

**Before:**
```typescript
// Standard processor: 3GB memory
memorySize: 3008

// High-memory processor: 10GB memory
memorySize: 10240
```

**After PowerTuning:**
```typescript
// Standard processor: 1.5GB memory (50% reduction)
tunedMemorySize: 1536

// High-memory processor: 3GB memory (70% reduction!)
tunedMemorySize: 3008
```

**Monthly Savings:**
- Standard processor: $20 → $10/month (50% savings)
- High-memory processor: $35 → $12/month (66% savings)
- **Total: $33/month savings on 2 functions**

## Monitoring and Optimization

### Access Dashboards

```bash
# View cost dashboard
https://console.aws.amazon.com/cloudwatch/home?region=us-east-1#dashboards:name=lambda-cost-dev

# View individual function dashboards
https://console.aws.amazon.com/cloudwatch/home?region=us-east-1#dashboards:name=aistudio-doc-processor-dev-metrics
```

### Key Metrics to Monitor

1. **Duration**: Should be consistently under timeout
2. **Memory Utilization**: Should be 60-80% of allocated memory
3. **Error Rate**: Should be <1%
4. **Throttles**: Should be zero with reserved concurrency
5. **Cold Starts**: Reduced with provisioned concurrency

### Re-tuning

Re-run PowerTuning when:
- Function logic changes significantly
- Traffic patterns change
- New dependencies are added
- Performance degradation is observed

## Troubleshooting

### Issue: esbuild bundling fails

**Solution:** Check for native dependencies:
```typescript
externalModules: ['@aws-sdk/*', 'pg-native'],
enableOptimizedBundling: true,
```

### Issue: Cold starts still high

**Solution:** Add provisioned concurrency for critical functions:
```typescript
concurrency: {
  provisioned: 2,
  autoScaling: {
    minCapacity: 2,
    maxCapacity: 10,
    targetUtilization: 0.7,
  },
},
```

### Issue: PowerTuning results seem incorrect

**Solution:** Use production-like test data:
```json
{
  "lambdaARN": "...",
  "payload": {
    "Records": [{
      "body": "{\"bucketName\": \"...\", \"key\": \"large-file.pdf\"}"
    }]
  },
  "num": 20,
  "strategy": "balanced"
}
```

## Best Practices

1. **Always run PowerTuning** before deploying to production
2. **Monitor actual usage** for 1 week before applying tuning results
3. **Use reserved concurrency** to prevent throttling
4. **Enable X-Ray tracing** for critical functions
5. **Keep bundles small** - use layers for shared dependencies
6. **Test ARM64 compatibility** thoroughly before production deployment
7. **Re-tune quarterly** or when workload patterns change
8. **Use cost dashboards** to track savings over time

## Next Steps

1. Migrate one stack at a time
2. Run PowerTuning for each function
3. Monitor performance for 1 week
4. Apply tuning results gradually
5. Compare costs before/after in Cost Explorer
6. Document savings and share with team

## Resources

- [AWS Lambda PowerTuning](https://github.com/alexcasalboni/aws-lambda-power-tuning)
- [Graviton2 Performance](https://aws.amazon.com/blogs/compute/migrating-aws-lambda-functions-to-arm-based-aws-graviton2-processors/)
- [Lambda Best Practices](https://docs.aws.amazon.com/lambda/latest/dg/best-practices.html)
- [esbuild Documentation](https://esbuild.github.io/)
