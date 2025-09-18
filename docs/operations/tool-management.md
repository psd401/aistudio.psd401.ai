# Tool Management in AI Studio

## Overview

This guide provides comprehensive instructions for administrators to manage Assistant Architect tools, including configuration, monitoring, troubleshooting, and maintenance procedures.

## Administrative Access

### Required Permissions
- **System Administrator**: Full tool management access
- **Tool Administrator**: Tool configuration and monitoring
- **Support Staff**: Read-only access to diagnostics

### Access Verification
```sql
-- SECURITY NOTE: The following SQL examples are for documentation purposes only.
-- In production code, ALWAYS use parameterized queries through the executeSQL function
-- with proper parameter binding to prevent SQL injection attacks.

-- Check admin permissions
SELECT u.username, r.role_name, rp.permission
FROM users u
JOIN user_roles ur ON u.id = ur.user_id
JOIN roles r ON ur.role_id = r.id
JOIN role_permissions rp ON r.id = rp.role_id
WHERE rp.permission LIKE '%tool%'
AND u.active = true
ORDER BY u.username;
```

## Tool Configuration Management

### Model Capability Configuration

#### View Current Model Capabilities
```sql
-- SECURITY NOTE: The following SQL examples are for documentation purposes only.
-- In production code, ALWAYS use parameterized queries through the executeSQL function
-- with proper parameter binding to prevent SQL injection attacks.

-- List all models with tool support
SELECT
  id,
  model_id,
  name,
  provider,
  active,
  capabilities,
  created_at
FROM ai_models
WHERE capabilities IS NOT NULL
ORDER BY provider, name;
```

#### Enable Tools for a Model
```sql
-- SECURITY NOTE: The following SQL examples are for documentation purposes only.
-- In production code, ALWAYS use parameterized queries through the executeSQL function
-- with proper parameter binding to prevent SQL injection attacks.

-- Enable web search and code interpreter for GPT-5 (use parameterized queries in actual implementation)
UPDATE ai_models
SET capabilities = jsonb_set(
  COALESCE(capabilities, '{}'),
  '{tools}',
  '["web_search", "code_interpreter"]'
)
WHERE model_id = 'gpt-5' AND active = true;

-- Set tool-specific configurations (use parameterized queries in actual implementation)
UPDATE ai_models
SET capabilities = jsonb_set(
  capabilities,
  '{toolSettings}',
  '{
    "maxToolCalls": 5,
    "parallelExecution": true,
    "timeoutSeconds": 30,
    "webSearch": {
      "maxResults": 10,
      "timeout": 15000
    },
    "codeInterpreter": {
      "memoryLimitMB": 512,
      "cpuTimeoutSeconds": 30
    }
  }'
)
WHERE model_id = 'gpt-5';
```

#### Disable Tools for a Model
```sql
-- SECURITY NOTE: The following SQL examples are for documentation purposes only.
-- In production code, ALWAYS use parameterized queries through the executeSQL function
-- with proper parameter binding to prevent SQL injection attacks.

-- Remove all tool support (use parameterized queries in actual implementation)
UPDATE ai_models
SET capabilities = capabilities - 'tools'
WHERE model_id = 'gpt-3.5-turbo';

-- Remove specific tool (use parameterized queries in actual implementation)
UPDATE ai_models
SET capabilities = jsonb_set(
  capabilities,
  '{tools}',
  (capabilities->'tools')::jsonb - 'web_search'
)
WHERE model_id = 'gpt-4';
```

### Tool Registry Management

#### Available Tools Registry
```typescript
// lib/tools/tool-registry.ts
const TOOL_REGISTRY: Record<string, ToolDefinition> = {
  web_search: {
    id: 'web_search',
    name: 'Web Search',
    description: 'Search the web for current information',
    supportedModels: ['gpt-5', 'gemini-pro'],
    configSchema: {
      maxResults: { type: 'number', default: 10, max: 20 },
      timeout: { type: 'number', default: 15000, max: 30000 }
    },
    enabled: true
  },
  code_interpreter: {
    id: 'code_interpreter',
    name: 'Code Interpreter',
    description: 'Execute Python code in a secure environment',
    supportedModels: ['gpt-5', 'gpt-4o', 'gemini-pro'],
    configSchema: {
      memoryLimit: { type: 'number', default: 512, max: 1024 },
      timeoutSeconds: { type: 'number', default: 30, max: 60 }
    },
    enabled: true
  }
}
```

#### Enable/Disable Tools Globally
```sql
-- Add new tool to registry (requires code deployment)
-- Update tool status in environment variables
-- AWS Systems Manager Parameter Store

aws ssm put-parameter \
  --name "/ai-studio/tools/web_search/enabled" \
  --value "true" \
  --type "String" \
  --overwrite

aws ssm put-parameter \
  --name "/ai-studio/tools/code_interpreter/enabled" \
  --value "true" \
  --type "String" \
  --overwrite
```

## User Permission Management

### Tool Access Control

#### Grant Tool Access to Users
```sql
-- SECURITY NOTE: The following SQL examples are for documentation purposes only.
-- In production code, ALWAYS use parameterized queries through the executeSQL function
-- with proper parameter binding to prevent SQL injection attacks.

-- Create tool-specific permissions
INSERT INTO permissions (name, description)
VALUES
  ('use_web_search', 'Permission to use web search tool'),
  ('use_code_interpreter', 'Permission to use code interpreter tool');

-- Grant permissions to role (use parameterized queries in actual implementation)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.role_name = 'premium_user'
AND p.name IN ('use_web_search', 'use_code_interpreter');

-- Grant permissions to specific user (use parameterized queries in actual implementation)
INSERT INTO user_permissions (user_id, permission_id)
SELECT u.id, p.id
FROM users u
CROSS JOIN permissions p
WHERE u.username = 'specific_user'
AND p.name = 'use_web_search';
```

#### Check User Tool Access
```sql
-- SECURITY NOTE: The following SQL examples are for documentation purposes only.
-- In production code, ALWAYS use parameterized queries through the executeSQL function
-- with proper parameter binding to prevent SQL injection attacks.

-- Check user's tool permissions (use parameterized queries in actual implementation)
SELECT
  u.username,
  p.name as permission,
  CASE
    WHEN up.user_id IS NOT NULL THEN 'Direct'
    WHEN rp.role_id IS NOT NULL THEN r.role_name
    ELSE 'No Access'
  END as access_source
FROM users u
LEFT JOIN user_permissions up ON u.id = up.user_id
LEFT JOIN permissions p ON up.permission_id = p.id
LEFT JOIN user_roles ur ON u.id = ur.user_id
LEFT JOIN roles r ON ur.role_id = r.id
LEFT JOIN role_permissions rp ON r.id = rp.role_id AND rp.permission_id = p.id
WHERE u.username = 'target_user'
AND p.name LIKE '%tool%'
ORDER BY p.name;
```

#### Revoke Tool Access
```sql
-- SECURITY NOTE: The following SQL examples are for documentation purposes only.
-- In production code, ALWAYS use parameterized queries through the executeSQL function
-- with proper parameter binding to prevent SQL injection attacks.

-- Revoke direct user permission (use parameterized queries in actual implementation)
DELETE FROM user_permissions
WHERE user_id = (SELECT id FROM users WHERE username = 'target_user')
AND permission_id = (SELECT id FROM permissions WHERE name = 'use_web_search');

-- Remove permission from role (use parameterized queries in actual implementation)
DELETE FROM role_permissions
WHERE role_id = (SELECT id FROM roles WHERE role_name = 'basic_user')
AND permission_id = (SELECT id FROM permissions WHERE name = 'use_code_interpreter');
```

## Monitoring and Analytics

### Tool Usage Metrics

#### Daily Usage Summary
```sql
-- SECURITY NOTE: The following SQL examples are for documentation purposes only.
-- In production code, ALWAYS use parameterized queries through the executeSQL function
-- with proper parameter binding to prevent SQL injection attacks.

-- Daily tool usage statistics
SELECT
  DATE(te.started_at) as usage_date,
  jsonb_array_elements_text(cp.enabled_tools) as tool_name,
  COUNT(*) as execution_count,
  COUNT(CASE WHEN te.status = 'completed' THEN 1 END) as successful_executions,
  AVG(EXTRACT(EPOCH FROM (te.completed_at - te.started_at))) as avg_duration_seconds,
  COUNT(DISTINCT te.user_id) as unique_users
FROM tool_executions te
JOIN assistant_architects aa ON te.assistant_architect_id = aa.id
JOIN chain_prompts cp ON aa.id = cp.tool_id
WHERE te.started_at > NOW() - INTERVAL '30 days'
AND cp.enabled_tools IS NOT NULL
GROUP BY DATE(te.started_at), jsonb_array_elements_text(cp.enabled_tools)
ORDER BY usage_date DESC, execution_count DESC;
```

#### Performance Analysis
```sql
-- SECURITY NOTE: The following SQL examples are for documentation purposes only.
-- In production code, ALWAYS use parameterized queries through the executeSQL function
-- with proper parameter binding to prevent SQL injection attacks.

-- Tool performance analysis
SELECT
  jsonb_array_elements_text(cp.enabled_tools) as tool_name,
  COUNT(*) as total_executions,
  ROUND(AVG(EXTRACT(EPOCH FROM (te.completed_at - te.started_at))), 2) as avg_duration,
  ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (te.completed_at - te.started_at))), 2) as median_duration,
  ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (te.completed_at - te.started_at))), 2) as p95_duration,
  ROUND(COUNT(CASE WHEN te.status = 'completed' THEN 1 END) * 100.0 / COUNT(*), 2) as success_rate
FROM tool_executions te
JOIN assistant_architects aa ON te.assistant_architect_id = aa.id
JOIN chain_prompts cp ON aa.id = cp.tool_id
WHERE te.started_at > NOW() - INTERVAL '7 days'
AND te.completed_at IS NOT NULL
AND cp.enabled_tools IS NOT NULL
GROUP BY jsonb_array_elements_text(cp.enabled_tools)
ORDER BY total_executions DESC;
```

#### User Adoption Tracking
```sql
-- SECURITY NOTE: The following SQL examples are for documentation purposes only.
-- In production code, ALWAYS use parameterized queries through the executeSQL function
-- with proper parameter binding to prevent SQL injection attacks.

-- User adoption metrics
SELECT
  DATE_TRUNC('week', te.started_at) as week_start,
  COUNT(DISTINCT te.user_id) as active_tool_users,
  COUNT(*) as total_tool_executions,
  ROUND(AVG(COUNT(*)) OVER (ORDER BY DATE_TRUNC('week', te.started_at) ROWS BETWEEN 3 PRECEDING AND CURRENT ROW), 2) as rolling_avg_executions
FROM tool_executions te
WHERE te.started_at > NOW() - INTERVAL '12 weeks'
GROUP BY DATE_TRUNC('week', te.started_at)
ORDER BY week_start;
```

### Error Monitoring

#### Error Rate Analysis
```sql
-- SECURITY NOTE: The following SQL examples are for documentation purposes only.
-- In production code, ALWAYS use parameterized queries through the executeSQL function
-- with proper parameter binding to prevent SQL injection attacks.

-- Error analysis by tool and error type
SELECT
  jsonb_array_elements_text(cp.enabled_tools) as tool_name,
  te.status,
  COUNT(*) as error_count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (PARTITION BY jsonb_array_elements_text(cp.enabled_tools)), 2) as error_percentage,
  array_agg(DISTINCT SUBSTRING(te.error_message, 1, 100)) as sample_errors
FROM tool_executions te
JOIN assistant_architects aa ON te.assistant_architect_id = aa.id
JOIN chain_prompts cp ON aa.id = cp.tool_id
WHERE te.started_at > NOW() - INTERVAL '24 hours'
AND te.status != 'completed'
AND cp.enabled_tools IS NOT NULL
GROUP BY jsonb_array_elements_text(cp.enabled_tools), te.status
ORDER BY tool_name, error_count DESC;
```

### CloudWatch Metrics Setup

#### Custom Metrics Configuration
```bash
# Tool execution duration
aws cloudwatch put-metric-data \
  --namespace "AI-Studio/Tools" \
  --metric-data MetricName=ExecutionDuration,Value=$DURATION_MS,Unit=Milliseconds,Dimensions=ToolType=$TOOL_TYPE

# Tool success rate
aws cloudwatch put-metric-data \
  --namespace "AI-Studio/Tools" \
  --metric-data MetricName=SuccessRate,Value=$SUCCESS_RATE,Unit=Percent,Dimensions=ToolType=$TOOL_TYPE

# Active tool users
aws cloudwatch put-metric-data \
  --namespace "AI-Studio/Tools" \
  --metric-data MetricName=ActiveUsers,Value=$USER_COUNT,Unit=Count
```

#### Dashboard Creation
```json
{
  "widgets": [
    {
      "type": "metric",
      "properties": {
        "metrics": [
          ["AI-Studio/Tools", "ExecutionDuration", "ToolType", "web_search"],
          ["...", "code_interpreter"]
        ],
        "period": 300,
        "stat": "Average",
        "region": "us-west-2",
        "title": "Tool Execution Duration"
      }
    },
    {
      "type": "metric",
      "properties": {
        "metrics": [
          ["AI-Studio/Tools", "SuccessRate", "ToolType", "web_search"],
          ["...", "code_interpreter"]
        ],
        "period": 300,
        "stat": "Average",
        "region": "us-west-2",
        "title": "Tool Success Rate",
        "yAxis": {
          "left": {
            "min": 90,
            "max": 100
          }
        }
      }
    }
  ]
}
```

## Infrastructure Management

### Lambda Function Management

#### Tool Execution Worker Configuration
```bash
# Update Lambda function configuration
aws lambda update-function-configuration \
  --function-name assistant-architect-worker \
  --timeout 300 \
  --memory-size 1024 \
  --environment Variables='{
    "TOOL_TIMEOUT_SECONDS": "30",
    "MAX_CONCURRENT_TOOLS": "10",
    "WEB_SEARCH_API_KEY": "encrypted_key",
    "CODE_EXECUTION_MEMORY_LIMIT": "512"
  }'

# Update function code
aws lambda update-function-code \
  --function-name assistant-architect-worker \
  --zip-file fileb://deployment-package.zip
```

#### Scaling Configuration
```bash
# Set concurrent execution limit
aws lambda put-provisioned-concurrency-config \
  --function-name assistant-architect-worker \
  --qualifier "$LATEST" \
  --provisioned-concurrency-settings ProvisionedConcurrencyConfigs=[{FunctionName=assistant-architect-worker,ProvisionedConcurrency=10}]

# Configure auto-scaling
aws application-autoscaling register-scalable-target \
  --service-namespace lambda \
  --scalable-dimension lambda:function:provisioned-concurrency \
  --resource-id function:assistant-architect-worker:$LATEST \
  --min-capacity 5 \
  --max-capacity 50
```

### SQS Queue Management

#### Monitor Queue Health
```bash
# Check queue attributes
aws sqs get-queue-attributes \
  --queue-url "$TOOL_EXECUTION_QUEUE_URL" \
  --attribute-names All

# Monitor message statistics
aws cloudwatch get-metric-statistics \
  --namespace AWS/SQS \
  --metric-name ApproximateNumberOfMessages \
  --dimensions Name=QueueName,Value=tool-execution-queue \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Average,Maximum
```

#### Queue Configuration
```bash
# Update queue configuration
aws sqs set-queue-attributes \
  --queue-url "$TOOL_EXECUTION_QUEUE_URL" \
  --attributes '{
    "VisibilityTimeoutSeconds": "300",
    "MessageRetentionPeriod": "1209600",
    "ReceiveMessageWaitTimeSeconds": "20",
    "RedrivePolicy": "{\"deadLetterTargetArn\":\"arn:aws:sqs:region:account:dlq\",\"maxReceiveCount\":3}"
  }'
```

## Security Management

### API Key Management

#### Web Search API Keys

**🔒 CRITICAL SECURITY REQUIREMENTS:**
- **NEVER log API keys or secret values** in application code, logs, or monitoring systems
- **NEVER hardcode secrets** in code, configuration files, or documentation examples
- **NEVER expose secrets** in environment variables on shared systems
- **ALWAYS use IAM roles** instead of API keys where possible for AWS services
- **IMPLEMENT secret rotation** procedures with automated key rotation every 90 days maximum
- **MONITOR secret access** and log all secret retrieval operations for audit
- **USE least privilege** principles - grant minimum required permissions only

```bash
# Store API keys in AWS Secrets Manager with proper security practices
aws secretsmanager create-secret \
  --name "ai-studio/tools/web-search-api-key" \
  --description "API key for web search tool" \
  --secret-string "$WEB_SEARCH_API_KEY"

# Enable automatic rotation (CRITICAL: Implement automated key rotation)
aws secretsmanager rotate-secret \
  --secret-id "ai-studio/tools/web-search-api-key" \
  --rotation-lambda-arn "arn:aws:lambda:region:account:function:rotate-api-key"

# Set up secret access monitoring and alerting
aws logs create-log-group --log-group-name "/aws/secretsmanager/ai-studio"

# Configure resource-based policy for strict access control
aws secretsmanager put-resource-policy \
  --secret-id "ai-studio/tools/web-search-api-key" \
  --resource-policy '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Principal": {"AWS": "arn:aws:iam::ACCOUNT:role/AssistantArchitectRole"},
      "Action": "secretsmanager:GetSecretValue",
      "Resource": "*",
      "Condition": {
        "StringEquals": {
          "secretsmanager:VersionStage": "AWSCURRENT"
        }
      }
    }]
  }'
```

**Secure Secret Retrieval Pattern:**
```typescript
// SECURE: Proper secret handling with error management
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager'

async function getApiKeySecurely(secretId: string): Promise<string> {
  const client = new SecretsManagerClient({ region: process.env.AWS_REGION })

  try {
    const result = await client.send(new GetSecretValueCommand({ SecretId: secretId }))

    // NEVER log the secret value
    if (!result.SecretString) {
      throw new Error('Secret value not found')
    }

    return result.SecretString
  } catch (error) {
    // Log error without exposing secret details
    logger.error('Failed to retrieve API key', {
      secretId: sanitizeForLogging(secretId),
      error: error.message
    })
    throw new Error('API key retrieval failed')
  }
}

// INSECURE: Never do this
// console.log('API Key:', apiKey) // ❌ NEVER LOG SECRETS
// process.env.API_KEY = apiKey    // ❌ NEVER SET ENV VARS
```

#### Access Logging
```sql
-- SECURITY NOTE: The following SQL examples are for documentation purposes only.
-- In production code, ALWAYS use parameterized queries through the executeSQL function
-- with proper parameter binding to prevent SQL injection attacks.

-- Create audit log table
CREATE TABLE tool_audit_log (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  tool_type VARCHAR(50) NOT NULL,
  action VARCHAR(50) NOT NULL,
  resource_id VARCHAR(100),
  ip_address INET,
  user_agent TEXT,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  success BOOLEAN DEFAULT true,
  error_message TEXT
);

-- Log tool access (use parameterized queries in actual implementation)
INSERT INTO tool_audit_log (user_id, tool_type, action, resource_id, ip_address, user_agent)
VALUES (?, 'web_search', 'execute', ?, ?, ?);
```

### Data Privacy Compliance

#### Data Retention Policies
```sql
-- SECURITY NOTE: The following SQL examples are for documentation purposes only.
-- In production code, ALWAYS use parameterized queries through the executeSQL function
-- with proper parameter binding to prevent SQL injection attacks.

-- Automated cleanup of old tool executions
DELETE FROM tool_executions
WHERE started_at < NOW() - INTERVAL '90 days'
AND status IN ('completed', 'failed');

-- Archive sensitive data
INSERT INTO tool_executions_archive
SELECT * FROM tool_executions
WHERE started_at < NOW() - INTERVAL '30 days'
AND started_at >= NOW() - INTERVAL '90 days';
```

#### Content Filtering
```typescript
// Content filtering configuration
interface ContentFilter {
  enablePiiDetection: boolean
  blockedTerms: string[]
  sanitizationRules: SanitizationRule[]
  allowedDomains?: string[]  // For web search
  blockedDomains: string[]   // For web search
}

const CONTENT_FILTER_CONFIG: ContentFilter = {
  enablePiiDetection: true,
  blockedTerms: ['password', 'ssn', 'credit card'],
  sanitizationRules: [
    { pattern: /\b\d{3}-\d{2}-\d{4}\b/g, replacement: '[SSN]' },
    { pattern: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, replacement: '[CARD]' }
  ],
  blockedDomains: ['malicious-site.com', 'phishing-domain.net']
}
```

## Maintenance Procedures

### Routine Maintenance

#### Daily Tasks
1. **Monitor Tool Performance**
   ```bash
   # Check daily metrics
   ./scripts/check-tool-metrics.sh

   # Review error logs
   aws logs filter-log-events \
     --log-group-name "/aws/lambda/assistant-architect-worker" \
     --start-time $(date -d 'yesterday' +%s)000 \
     --filter-pattern "ERROR"
   ```

2. **Validate Tool Availability**
   ```bash
   # Test web search functionality
   curl -X POST "https://api.aistudio.example.com/api/tools/test" \
     -H "Authorization: Bearer $ADMIN_TOKEN" \
     -d '{"tool": "web_search", "query": "test"}'

   # Test code interpreter
   curl -X POST "https://api.aistudio.example.com/api/tools/test" \
     -H "Authorization: Bearer $ADMIN_TOKEN" \
     -d '{"tool": "code_interpreter", "code": "print(\"test\")"}'
   ```

#### Weekly Tasks
1. **Performance Review**
   - Analyze tool usage trends
   - Review success rates and error patterns
   - Check resource utilization

2. **Capacity Planning**
   - Monitor queue depths and processing times
   - Review Lambda concurrency limits
   - Assess storage usage for tool results

#### Monthly Tasks
1. **Security Audit**
   - Review access logs for anomalies
   - Validate user permissions
   - Check for unauthorized tool usage

2. **Cost Optimization**
   - Analyze tool execution costs
   - Review resource allocation
   - Optimize Lambda configurations

### Backup and Recovery

#### Configuration Backup
```bash
# Backup tool configurations
pg_dump --host=$DB_HOST --username=$DB_USER --dbname=$DB_NAME \
  --table=ai_models \
  --table=permissions \
  --table=role_permissions \
  --data-only > tool_config_backup.sql

# Backup Lambda configurations
aws lambda get-function \
  --function-name assistant-architect-worker > lambda_config_backup.json
```

#### Disaster Recovery
1. **Tool Service Outage**
   - Switch to degraded mode without tools
   - Notify users of service limitations
   - Implement emergency response procedures

2. **Data Loss Recovery**
   - Restore from database backups
   - Rebuild Lambda functions from IaC
   - Validate tool functionality

## Troubleshooting Procedures

### Common Administrative Issues

#### Issue: Tools not appearing for users
**Diagnosis:**
1. Check model capabilities in database
2. Verify user permissions
3. Validate tool registry configuration

**Resolution:**
```sql
-- SECURITY NOTE: The following SQL examples are for documentation purposes only.
-- In production code, ALWAYS use parameterized queries through the executeSQL function
-- with proper parameter binding to prevent SQL injection attacks.

-- Fix missing model capabilities (use parameterized queries in actual implementation)
UPDATE ai_models
SET capabilities = '{"tools": ["web_search", "code_interpreter"]}'
WHERE model_id = 'affected-model' AND capabilities IS NULL;

-- Grant missing permissions (use parameterized queries in actual implementation)
INSERT INTO user_permissions (user_id, permission_id)
SELECT u.id, p.id
FROM users u, permissions p
WHERE u.username = 'affected-user'
AND p.name = 'use_web_search'
AND NOT EXISTS (
  SELECT 1 FROM user_permissions up
  WHERE up.user_id = u.id AND up.permission_id = p.id
);
```

#### Issue: High tool failure rate
**Diagnosis:**
1. Check CloudWatch metrics for Lambda errors
2. Review SQS dead letter queue
3. Analyze error patterns in database

**Resolution:**
1. Scale up Lambda resources
2. Implement circuit breaker for external APIs
3. Add retry logic for transient failures

### Emergency Procedures

#### Critical Tool Outage
1. **Immediate Response**
   ```bash
   # Disable problematic tool
   aws ssm put-parameter \
     --name "/ai-studio/tools/web_search/enabled" \
     --value "false" \
     --overwrite

   # Scale up backup processing
   aws lambda put-provisioned-concurrency-config \
     --function-name assistant-architect-worker-backup \
     --provisioned-concurrency-settings ProvisionedConcurrency=20
   ```

2. **Communication**
   - Update status page
   - Notify stakeholders
   - Provide estimated recovery time

3. **Recovery**
   - Identify root cause
   - Implement fix
   - Gradually restore service
   - Monitor for stability

## Support Contacts

- **Primary On-Call**: tools-oncall@aistudio.example.com
- **Engineering Team**: tools-team@aistudio.example.com
- **Security Team**: security@aistudio.example.com
- **Infrastructure Team**: infra@aistudio.example.com

## Escalation Matrix

1. **Level 1**: Basic configuration issues, user permissions
2. **Level 2**: Performance problems, moderate outages
3. **Level 3**: Security incidents, critical system failures
4. **Level 4**: Executive notification, major incidents

---

*Last updated: September 2025*
*Document owner: AI Studio Infrastructure Team*