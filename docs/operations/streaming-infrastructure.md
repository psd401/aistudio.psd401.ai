# Streaming Infrastructure Operations Guide

## Overview

This guide covers the operational aspects of the Universal Polling Architecture, including infrastructure setup, monitoring, deployment procedures, and troubleshooting for the streaming AI system.

## Infrastructure Components

### AWS Services Stack

```mermaid
graph TB
    subgraph "AWS Infrastructure"
        Amplify[AWS Amplify<br/>Next.js SSR Hosting]
        Lambda[Lambda Workers<br/>AI Processing]
        SQS[Amazon SQS<br/>Job Queue]
        RDS[Aurora Serverless v2<br/>PostgreSQL Database]
        Secrets[Secrets Manager<br/>API Keys & Config]
        CloudWatch[CloudWatch<br/>Logs & Metrics]
        IAM[IAM Roles<br/>& Policies]
    end
    
    subgraph "External Services"
        OpenAI[OpenAI API]
        Bedrock[Amazon Bedrock]
        Google[Google Gemini API]
        Azure[Azure OpenAI]
    end
    
    Amplify --> Lambda
    Lambda --> SQS
    Lambda --> RDS
    Lambda --> Secrets
    Lambda --> OpenAI
    Lambda --> Bedrock
    Lambda --> Google
    Lambda --> Azure
    
    Amplify --> RDS
    Amplify --> Secrets
    
    Lambda --> CloudWatch
    Amplify --> CloudWatch
    
    IAM --> Lambda
    IAM --> Amplify
    
    style Amplify fill:#ff9800
    style Lambda fill:#4caf50
    style SQS fill:#2196f3
    style RDS fill:#9c27b0
```

## SQS Queue Configuration

### Queue Settings

```yaml
# aistudio-{environment}-streaming-jobs-queue
Queue Type: Standard
Visibility Timeout: 300 seconds (5 minutes)
Message Retention Period: 1209600 seconds (14 days)
Receive Wait Time: 0 seconds (short polling)
Maximum Receives: 3
Dead Letter Queue: aistudio-{environment}-streaming-jobs-dlq
```

### Queue Permissions

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::{ACCOUNT}:role/amplify-backend-role"
      },
      "Action": [
        "sqs:SendMessage",
        "sqs:GetQueueAttributes"
      ],
      "Resource": "arn:aws:sqs:{REGION}:{ACCOUNT}:aistudio-{ENV}-streaming-jobs-queue"
    },
    {
      "Effect": "Allow", 
      "Principal": {
        "AWS": "arn:aws:iam::{ACCOUNT}:role/lambda-streaming-worker-role"
      },
      "Action": [
        "sqs:ReceiveMessage",
        "sqs:DeleteMessage",
        "sqs:GetQueueAttributes"
      ],
      "Resource": "arn:aws:sqs:{REGION}:{ACCOUNT}:aistudio-{ENV}-streaming-jobs-queue"
    }
  ]
}
```

### Dead Letter Queue Setup

```yaml
# aistudio-{environment}-streaming-jobs-dlq
Queue Type: Standard
Visibility Timeout: 300 seconds
Message Retention Period: 1209600 seconds (14 days)
Maximum Receives: (not applicable for DLQ)
```

## Lambda Worker Configuration

### Function Settings

```yaml
Function Name: aistudio-{environment}-streaming-worker
Runtime: Node.js 20.x
Architecture: x86_64
Memory: 1024 MB
Timeout: 900 seconds (15 minutes)
Environment Variables:
  - NODE_ENV: production
  - DATABASE_SECRET_ARN: arn:aws:secretsmanager:...
  - RDS_RESOURCE_ARN: arn:aws:rds:...
  - STREAMING_JOBS_QUEUE_URL: https://sqs...
  - AWS_REGION: us-east-1
```

### IAM Role Permissions

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "rds-data:BatchExecuteStatement",
        "rds-data:BeginTransaction", 
        "rds-data:CommitTransaction",
        "rds-data:ExecuteStatement",
        "rds-data:RollbackTransaction"
      ],
      "Resource": "arn:aws:rds:{REGION}:{ACCOUNT}:cluster:aistudio-{ENV}-db"
    },
    {
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue",
        "secretsmanager:DescribeSecret"
      ],
      "Resource": [
        "arn:aws:secretsmanager:{REGION}:{ACCOUNT}:secret:aistudio-{ENV}-db-*",
        "arn:aws:secretsmanager:{REGION}:{ACCOUNT}:secret:aistudio-{ENV}-api-keys-*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "sqs:ReceiveMessage",
        "sqs:DeleteMessage",
        "sqs:SendMessage",
        "sqs:GetQueueAttributes"
      ],
      "Resource": [
        "arn:aws:sqs:{REGION}:{ACCOUNT}:aistudio-{ENV}-streaming-jobs-queue",
        "arn:aws:sqs:{REGION}:{ACCOUNT}:aistudio-{ENV}-streaming-jobs-dlq"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "bedrock:InvokeModel",
        "bedrock:InvokeModelWithResponseStream"
      ],
      "Resource": "arn:aws:bedrock:{REGION}::foundation-model/*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream", 
        "logs:PutLogEvents"
      ],
      "Resource": "arn:aws:logs:{REGION}:{ACCOUNT}:*"
    }
  ]
}
```

### Event Source Mapping

```yaml
Event Source: Amazon SQS
SQS Queue: aistudio-{environment}-streaming-jobs-queue
Batch Size: 1
Maximum Batching Window: 0 seconds
Parallelization Factor: 10
Starting Position: TRIM_HORIZON
```

## Database Schema Management

### Migration Process

The AI streaming jobs table is managed through the standard migration system:

```sql
-- File: /infra/database/schema/033-ai-streaming-jobs.sql
CREATE TABLE ai_streaming_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id TEXT,                    -- Supports both integer and UUID
  user_id INTEGER NOT NULL,
  model_id INTEGER NOT NULL,
  status job_status NOT NULL DEFAULT 'pending',
  request_data JSONB NOT NULL,
  response_data JSONB,
  partial_content TEXT,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE
);
```

### Database Functions

```sql
-- Update job status with atomic operations
CREATE OR REPLACE FUNCTION update_job_status(
  p_job_id UUID,
  p_status job_status,
  p_partial_content TEXT DEFAULT NULL,
  p_progress_info JSONB DEFAULT NULL,
  p_error_message TEXT DEFAULT NULL
) RETURNS BOOLEAN AS $$
DECLARE
  updated_rows INTEGER;
BEGIN
  UPDATE ai_streaming_jobs 
  SET 
    status = p_status,
    partial_content = COALESCE(p_partial_content, partial_content),
    progress_info = COALESCE(p_progress_info, progress_info),
    error_message = COALESCE(p_error_message, error_message),
    started_at = CASE 
      WHEN p_status = 'running' AND started_at IS NULL 
      THEN NOW() 
      ELSE started_at 
    END,
    completed_at = CASE 
      WHEN p_status IN ('completed', 'failed') 
      THEN NOW() 
      ELSE completed_at 
    END
  WHERE id = p_job_id;
  
  GET DIAGNOSTICS updated_rows = ROW_COUNT;
  RETURN updated_rows > 0;
END;
$$ LANGUAGE plpgsql;

-- Cleanup expired jobs
CREATE OR REPLACE FUNCTION cleanup_expired_streaming_jobs()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM ai_streaming_jobs 
  WHERE expires_at < NOW() 
    OR (created_at < NOW() - INTERVAL '24 hours' AND status = 'completed')
    OR (created_at < NOW() - INTERVAL '1 hour' AND status = 'failed')
    OR (created_at < NOW() - INTERVAL '2 hours' AND status = 'pending');
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;
```

### Index Optimization

```sql
-- Performance indexes for job queries
CREATE INDEX idx_ai_streaming_jobs_user_status 
ON ai_streaming_jobs(user_id, status, created_at DESC);

CREATE INDEX idx_ai_streaming_jobs_status_created 
ON ai_streaming_jobs(status, created_at) 
WHERE status IN ('pending', 'running');

CREATE INDEX idx_ai_streaming_jobs_expires 
ON ai_streaming_jobs(expires_at) 
WHERE expires_at IS NOT NULL;

CREATE INDEX idx_ai_streaming_jobs_conversation 
ON ai_streaming_jobs(conversation_id, user_id, created_at DESC);
```

## Deployment Procedures

### Infrastructure Deployment

Using AWS CDK for complete infrastructure provisioning:

```bash
# Deploy all infrastructure stacks
cd infra
npx cdk deploy --all

# Deploy specific stacks
npx cdk deploy AIStudio-DatabaseStack-{ENV}
npx cdk deploy AIStudio-QueueStack-{ENV}
npx cdk deploy AIStudio-LambdaStack-{ENV}
npx cdk deploy AIStudio-FrontendStack-{ENV}
```

### Application Deployment

```bash
# Build and deploy the shared package
cd packages/ai-streaming-core
npm run build
npm run lint
npm run typecheck

# Deploy Next.js application
npm run build
npm run lint
npm run typecheck

# Amplify auto-deploys on git push to main/dev branches
```

### Database Migrations

```bash
# Run database migrations
cd infra/database
npm run migrate

# Verify migration status
npm run migrate:status
```

### Lambda Function Deployment

```bash
# Package Lambda function with dependencies
cd lambda/streaming-worker
npm run build
npm run package

# Deploy via CDK
cd ../../infra
npx cdk deploy AIStudio-LambdaStack-{ENV}
```

## Monitoring and Observability

### CloudWatch Metrics

#### Custom Metrics

```typescript
// Application metrics published to CloudWatch
const publishMetrics = async (metrics: {
  JobCreated: number;
  JobCompleted: number;
  JobFailed: number;
  ProcessingLatency: number;
  QueueDepth: number;
}) => {
  const cloudwatch = new CloudWatchClient({ region: process.env.AWS_REGION });
  
  await cloudwatch.send(new PutMetricDataCommand({
    Namespace: 'AIStudio/Streaming',
    MetricData: [
      {
        MetricName: 'JobsCreated',
        Value: metrics.JobCreated,
        Unit: 'Count',
        Timestamp: new Date()
      },
      {
        MetricName: 'ProcessingLatencyMs',
        Value: metrics.ProcessingLatency,
        Unit: 'Milliseconds',
        Dimensions: [
          { Name: 'Environment', Value: process.env.NODE_ENV }
        ]
      }
    ]
  }));
};
```

#### Dashboard Configuration

```json
{
  "widgets": [
    {
      "type": "metric",
      "properties": {
        "metrics": [
          ["AIStudio/Streaming", "JobsCreated", "Environment", "production"],
          ["AIStudio/Streaming", "JobsCompleted", "Environment", "production"],
          ["AIStudio/Streaming", "JobsFailed", "Environment", "production"]
        ],
        "period": 300,
        "stat": "Sum",
        "region": "us-east-1",
        "title": "Job Processing Metrics"
      }
    },
    {
      "type": "metric", 
      "properties": {
        "metrics": [
          ["AWS/SQS", "ApproximateNumberOfVisibleMessages", "QueueName", "aistudio-prod-streaming-jobs-queue"],
          ["AWS/SQS", "NumberOfMessagesSent", "QueueName", "aistudio-prod-streaming-jobs-queue"],
          ["AWS/SQS", "NumberOfMessagesReceived", "QueueName", "aistudio-prod-streaming-jobs-queue"]
        ],
        "period": 300,
        "stat": "Average",
        "region": "us-east-1", 
        "title": "SQS Queue Metrics"
      }
    }
  ]
}
```

### Log Aggregation

#### Structured Logging Format

```typescript
// Consistent log format across all components
interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  requestId?: string;
  jobId?: string;
  userId?: string;
  provider?: string;
  modelId?: string;
  duration?: number;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}
```

#### CloudWatch Log Groups

```yaml
Log Groups:
  - /aws/lambda/aistudio-{env}-streaming-worker
  - /aws/amplify/aistudio-{env}/server-logs
  - /aws/rds/cluster/aistudio-{env}-db/slowquery
  - /aws/sqs/aistudio-{env}-streaming-jobs-queue
```

### Alerting Setup

#### CloudWatch Alarms

```typescript
// High-priority alarms
const alarms = [
  {
    name: 'HighJobFailureRate',
    metric: 'AIStudio/Streaming/JobsFailed',
    threshold: 10,
    comparisonOperator: 'GreaterThanThreshold',
    evaluationPeriods: 2,
    period: 300,
    statistic: 'Sum',
    treatMissingData: 'notBreaching'
  },
  {
    name: 'LongQueueDepth',
    metric: 'AWS/SQS/ApproximateNumberOfVisibleMessages',
    threshold: 100,
    comparisonOperator: 'GreaterThanThreshold',
    evaluationPeriods: 3,
    period: 300,
    dimensions: { QueueName: 'aistudio-prod-streaming-jobs-queue' }
  },
  {
    name: 'HighLambdaErrors',
    metric: 'AWS/Lambda/Errors',
    threshold: 5,
    comparisonOperator: 'GreaterThanThreshold',
    evaluationPeriods: 2,
    period: 300,
    dimensions: { FunctionName: 'aistudio-prod-streaming-worker' }
  }
];
```

#### SNS Notification Topics

```yaml
Topics:
  - aistudio-{env}-critical-alerts
  - aistudio-{env}-operational-alerts
  
Subscriptions:
  - Protocol: email
    Endpoint: ops-team@domain.com
    Topic: aistudio-{env}-critical-alerts
  - Protocol: slack
    Endpoint: https://hooks.slack.com/...
    Topic: aistudio-{env}-operational-alerts
```

## Performance Tuning

### Database Optimization

#### Connection Pooling

```typescript
// RDS Data API with connection management
const executeSQL = async (query: string, parameters: Parameter[] = []) => {
  const rdsData = new RDSDataClient({
    region: process.env.AWS_REGION,
    maxAttempts: 3,
    retryMode: 'adaptive'
  });
  
  return await rdsData.send(new ExecuteStatementCommand({
    resourceArn: process.env.RDS_RESOURCE_ARN,
    secretArn: process.env.DATABASE_SECRET_ARN,
    database: 'aistudio',
    sql: query,
    parameters,
    includeResultMetadata: true
  }));
};
```

#### Query Optimization

```sql
-- Optimized job lookup with proper indexing
EXPLAIN (ANALYZE, BUFFERS) 
SELECT id, status, partial_content, response_data 
FROM ai_streaming_jobs 
WHERE id = $1::uuid;

-- Efficient status polling query
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM ai_streaming_jobs 
WHERE user_id = $1 
  AND status IN ('pending', 'running') 
ORDER BY created_at DESC 
LIMIT 10;
```

### Lambda Performance

#### Cold Start Optimization

```typescript
// Pre-initialize connections outside handler
import { RDSDataClient } from '@aws-sdk/client-rds-data';
import { SQSClient } from '@aws-sdk/client-sqs';

// Initialize clients once
const rdsClient = new RDSDataClient({ region: process.env.AWS_REGION });
const sqsClient = new SQSClient({ region: process.env.AWS_REGION });

// Lambda handler
export const handler = async (event: SQSEvent) => {
  // Handler code uses pre-initialized clients
};
```

#### Memory Allocation

```yaml
# Optimal memory settings based on workload
Memory Settings:
  - Streaming Worker: 1024 MB (balance CPU/memory)
  - Database Functions: 512 MB (lightweight operations)
  - Queue Processors: 768 MB (moderate workload)
```

### SQS Optimization

#### Batch Processing

```typescript
// Process multiple jobs efficiently
export const processBatch = async (messages: SQSMessage[]) => {
  const jobPromises = messages.map(async (message) => {
    const jobId = message.Body;
    return processStreamingJob(jobId);
  });
  
  // Process jobs in parallel with concurrency limit
  const results = await Promise.allSettled(jobPromises);
  
  // Handle successes and failures appropriately
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      // Delete message from queue
      deleteSQSMessage(messages[index].ReceiptHandle);
    } else {
      // Log error for DLQ processing
      logger.error('Job processing failed', {
        jobId: messages[index].Body,
        error: result.reason
      });
    }
  });
};
```

## Security Configuration

### API Security

#### Authentication Flow

```typescript
// JWT validation for all API endpoints
export const validateSession = async (req: Request): Promise<Session | null> => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token) return null;
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return decoded as Session;
  } catch (error) {
    return null;
  }
};
```

#### Rate Limiting

```typescript
// Implement rate limiting for job creation
const rateLimiter = new Map<string, { count: number; resetTime: number }>();

export const checkRateLimit = (userId: string): boolean => {
  const now = Date.now();
  const limit = rateLimiter.get(userId);
  
  if (!limit || now > limit.resetTime) {
    rateLimiter.set(userId, { count: 1, resetTime: now + 60000 }); // 1 minute window
    return true;
  }
  
  if (limit.count >= 10) { // 10 requests per minute
    return false;
  }
  
  limit.count++;
  return true;
};
```

### Data Protection

#### Encryption at Rest

```yaml
Database:
  Encryption: AES-256
  Key Management: AWS KMS
  Backup Encryption: Enabled

SQS:
  Encryption: Server-side encryption (SSE-SQS)
  Message Retention: 14 days

Lambda:
  Environment Variables: Encrypted with KMS
  Secrets: AWS Secrets Manager
```

#### PII Sanitization

```typescript
// Remove sensitive data from logs
export const sanitizeForLogging = (data: any): any => {
  const sensitiveFields = ['apiKey', 'password', 'token', 'email', 'phone'];
  
  if (typeof data !== 'object' || data === null) {
    return data;
  }
  
  const sanitized = { ...data };
  
  sensitiveFields.forEach(field => {
    if (field in sanitized) {
      sanitized[field] = '[REDACTED]';
    }
  });
  
  return sanitized;
};
```

## Disaster Recovery

### Backup Strategy

#### Database Backups

```yaml
Aurora Cluster Backup:
  Automatic Backups: Enabled
  Backup Retention: 30 days
  Preferred Backup Window: 03:00-04:00 UTC
  Copy Tags to Snapshots: Enabled
  
Manual Snapshots:
  Frequency: Weekly
  Retention: 1 year
  Cross-region Copy: Enabled (dr-region)
```

#### Configuration Backup

```bash
#!/bin/bash
# Backup infrastructure configuration
aws ssm put-parameter \
  --name "/aistudio/backup/infrastructure-config" \
  --value "$(cat infrastructure-config.json)" \
  --type "SecureString" \
  --overwrite

# Backup application configuration
aws s3 cp config/ s3://aistudio-backups/config/ --recursive
```

### Recovery Procedures

#### Database Recovery

```bash
# Point-in-time recovery
aws rds restore-db-cluster-to-point-in-time \
  --db-cluster-identifier aistudio-recovered \
  --source-db-cluster-identifier aistudio-prod-db \
  --restore-to-time 2024-01-15T10:30:00.000Z

# Snapshot restoration
aws rds restore-db-cluster-from-snapshot \
  --db-cluster-identifier aistudio-recovered \
  --snapshot-identifier aistudio-prod-db-snapshot-2024-01-15
```

#### Service Recovery

```bash
# Redeploy infrastructure
cd infra
npx cdk deploy --all

# Restore application from git
git checkout main
npm run build
npm run deploy

# Verify service health
curl -f https://api.aistudio.psd401.ai/health || exit 1
```

This comprehensive infrastructure guide provides the foundation for reliable, scalable, and secure operation of the Universal Polling Architecture.