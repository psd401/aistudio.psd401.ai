# ECS Deployment Guide

Comprehensive guide for deploying and managing AI Studio on AWS ECS Fargate.

## Table of Contents

- [Quick Start](#quick-start)
- [Deployment Methods](#deployment-methods)
- [Monitoring](#monitoring)
- [Troubleshooting](#troubleshooting)
- [Rollback Procedures](#rollback-procedures)

## Quick Start

### Prerequisites

- AWS CLI configured with appropriate credentials
- Docker installed (for quick-deploy method)
- Node.js and npm installed
- CDK CLI installed: `npm install -g aws-cdk`

### 1. Full Deployment (Infrastructure + Application)

```bash
cd infra
./scripts/deploy-ecs-dev.sh
```

This script:
1. ✅ Validates AWS credentials
2. 🔨 Builds Docker image from project root
3. 📤 Pushes image to ECR
4. 🚀 Deploys/updates all infrastructure via CDK
5. ⏳ Waits for service to stabilize
6. 📊 Displays monitoring URLs

**When to use**: First deployment, infrastructure changes, or when you're not in a hurry.

### 2. Quick Deployment (Application Only)

```bash
cd infra
./scripts/quick-deploy.sh
```

This script:
1. 🔨 Builds Docker image
2. 📤 Pushes to ECR
3. 🔄 Forces ECS service to pull new image

**When to use**: Rapid testing of application code changes without infrastructure updates.

## Deployment Methods

### Method 1: CDK Full Deployment (Recommended)

**Use Case**: Production deployments, infrastructure changes, first-time setup

```bash
cd infra
npx cdk deploy AIStudio-FrontendStack-Dev-Ecs
```

**How it works**:
- CDK uses `ContainerImage.fromAsset()` to automatically build and push Docker images
- Image is pushed to ECR **before** ECS service creation/update
- Solves the "chicken-and-egg" problem
- Single command for complete deployment

**Benefits**:
- ✅ Infrastructure as Code
- ✅ Automated image building
- ✅ Safe deployment order
- ✅ Git-tracked configuration

### Method 2: Quick Deploy Script

**Use Case**: Rapid application testing during development

```bash
./infra/scripts/quick-deploy.sh
```

**How it works**:
- Builds Docker image locally
- Pushes to existing ECR repository
- Forces ECS to deploy new image
- No CDK synthesis or CloudFormation updates

**Benefits**:
- ⚡ Faster iteration cycle
- 🔄 No infrastructure changes
- 💰 Lower deployment overhead

### Method 3: Manual Docker Workflow

**Use Case**: Advanced debugging, custom build processes

```bash
# 1. Authenticate with ECR
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin \
  390844780692.dkr.ecr.us-east-1.amazonaws.com

# 2. Build for ARM64 (matches Fargate)
docker buildx build --platform linux/arm64 -t aistudio-dev:latest .

# 3. Tag for ECR
REPO_URI=$(aws ssm get-parameter --name /aistudio/dev/ecr-repository-uri --query Parameter.Value --output text)
docker tag aistudio-dev:latest $REPO_URI:latest

# 4. Push
docker push $REPO_URI:latest

# 5. Force deployment
aws ecs update-service \
  --cluster aistudio-dev \
  --service aistudio-dev \
  --force-new-deployment
```

## Monitoring

### CloudWatch Dashboards

The deployment creates a comprehensive CloudWatch dashboard with:

#### Service Health
- **CPU & Memory Utilization**: Track resource usage
- **Task Count**: Running vs desired tasks
- **Target Health**: Healthy/unhealthy ALB targets

#### Request Metrics
- **Request Volume**: Requests per minute
- **Error Rates**: 4XX and 5XX errors
- **Response Time**: P50, P90, P99 latencies

#### Streaming Performance
- **Time to First Token (TTFT)**: Average and P99
- **Streaming Errors**: Error count over time

#### Active Connections
- **Active/New Connections**: Monitor concurrent users

Access dashboard:
```bash
open "https://console.aws.amazon.com/cloudwatch/home?region=us-east-1#dashboards:name=aistudio-ecs-dev"
```

### CloudWatch Alarms

The following alarms are automatically created:

| Alarm | Threshold | Description |
|-------|-----------|-------------|
| High Error Rate | >10 errors in 10 min | 5XX errors exceeding threshold |
| Unhealthy Targets | ≥1 unhealthy | ALB reporting unhealthy targets |
| High CPU | >80% for 10 min | CPU utilization too high |
| High Memory | >85% for 10 min | Memory utilization too high |
| No Running Tasks | <1 task for 2 min | Service has no running tasks |

### Viewing Logs

**Real-time logs**:
```bash
aws logs tail /ecs/aistudio-dev --follow
```

**Filter by request ID**:
```bash
aws logs tail /ecs/aistudio-dev --follow --filter-pattern "requestId=abc123"
```

**CloudWatch Insights**:
```bash
# View in console
open "https://console.aws.amazon.com/cloudwatch/home?region=us-east-1#logsV2:logs-insights"

# Example query: Recent errors
fields @timestamp, level, message, error.code
| filter level = "error"
| sort @timestamp desc
| limit 20
```

## Deployment Validation

After deployment, validate the service:

### 1. Check Service Health

```bash
aws ecs describe-services \
  --cluster aistudio-dev \
  --services aistudio-dev \
  --query 'services[0].{Status:status,Running:runningCount,Desired:desiredCount,Health:healthCheckGracePeriodSeconds}'
```

Expected output:
```json
{
  "Status": "ACTIVE",
  "Running": 1,
  "Desired": 1
}
```

### 2. Check Task Health

```bash
aws ecs list-tasks --cluster aistudio-dev --service-name aistudio-dev
aws ecs describe-tasks --cluster aistudio-dev --tasks <task-arn>
```

### 3. Check ALB Targets

```bash
# Get target group ARN
TG_ARN=$(aws elbv2 describe-target-groups \
  --query "TargetGroups[?contains(TargetGroupName, 'aistudio-dev')].TargetGroupArn" \
  --output text)

# Check target health
aws elbv2 describe-target-health --target-group-arn $TG_ARN
```

Expected output:
```json
{
  "TargetHealthDescriptions": [
    {
      "TargetHealth": {
        "State": "healthy"
      }
    }
  ]
}
```

### 4. Test Application

```bash
# Get ALB DNS name
ALB_DNS=$(aws ssm get-parameter --name /aistudio/dev/alb-dns-name --query Parameter.Value --output text)

# Test health endpoint
curl http://$ALB_DNS/api/healthz

# Expected: {"status":"ok"}
```

## Troubleshooting

### Issue: Tasks failing to start

**Symptoms**: Tasks start and immediately stop

**Diagnosis**:
```bash
# Get stopped task ID
TASK_ID=$(aws ecs list-tasks --cluster aistudio-dev --service-name aistudio-dev --desired-status STOPPED --max-items 1 --query 'taskArns[0]' --output text)

# View stop reason
aws ecs describe-tasks --cluster aistudio-dev --tasks $TASK_ID \
  --query 'tasks[0].{StopReason:stoppedReason,StopCode:stopCode,Containers:containers[*].{Name:name,Reason:reason,ExitCode:exitCode}}'
```

**Common causes**:
1. **Environment variable missing**: Check task definition
2. **Secrets Manager access denied**: Verify IAM task execution role
3. **Out of memory**: Increase memory in task definition
4. **Image pull failure**: Check ECR repository permissions

### Issue: Unhealthy targets

**Symptoms**: ALB reports targets as unhealthy

**Diagnosis**:
```bash
# Check health check configuration
aws elbv2 describe-target-groups \
  --query "TargetGroups[?contains(TargetGroupName, 'aistudio-dev')].HealthCheckPath"

# Check application logs
aws logs tail /ecs/aistudio-dev --follow --filter-pattern "/api/healthz"
```

**Common causes**:
1. **Health endpoint not responding**: Check `/api/healthz` endpoint
2. **Application startup too slow**: Increase health check grace period
3. **Container crash loop**: Check logs for errors

### Issue: High latency

**Symptoms**: P99 response time >3 seconds

**Diagnosis**:
```bash
# Check if CPU/memory constrained
aws cloudwatch get-metric-statistics \
  --namespace AWS/ECS \
  --metric-name CPUUtilization \
  --dimensions Name=ServiceName,Value=aistudio-dev Name=ClusterName,Value=aistudio-dev \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Average
```

**Solutions**:
1. **Scale up**: Increase desired task count
2. **Scale out**: Increase task CPU/memory
3. **Optimize**: Review application performance

### Issue: Deployment stuck

**Symptoms**: Deployment remains in progress

**Diagnosis**:
```bash
aws ecs describe-services --cluster aistudio-dev --services aistudio-dev \
  --query 'services[0].deployments'
```

**Solutions**:
1. **Wait**: Deployments can take 10-15 minutes
2. **Check tasks**: Ensure new tasks are starting
3. **Rollback**: See rollback procedures below

## Rollback Procedures

### Option 1: Automatic Rollback

CDK configures circuit breaker with automatic rollback:
- If new tasks fail health checks
- Deployment automatically reverts to previous version
- No manual intervention required

### Option 2: Manual Rollback via Console

1. Navigate to ECS Console
2. Select cluster `aistudio-dev`
3. Select service `aistudio-dev`
4. Click "Update Service"
5. Check "Force new deployment"
6. Click "Update"

### Option 3: Rollback via CLI

```bash
# Get previous task definition
PREVIOUS_TASK_DEF=$(aws ecs describe-services \
  --cluster aistudio-dev \
  --services aistudio-dev \
  --query 'services[0].deployments[1].taskDefinition' \
  --output text)

# Update service to use previous task definition
aws ecs update-service \
  --cluster aistudio-dev \
  --service aistudio-dev \
  --task-definition $PREVIOUS_TASK_DEF \
  --force-new-deployment
```

### Option 4: Scale to Zero (Emergency)

In case of critical issues:

```bash
# Stop all tasks immediately
aws ecs update-service \
  --cluster aistudio-dev \
  --service aistudio-dev \
  --desired-count 0

# Wait 30 seconds

# Restore service with previous task definition
aws ecs update-service \
  --cluster aistudio-dev \
  --service aistudio-dev \
  --desired-count 1
```

## Scaling

### Auto-Scaling (Configured)

Service automatically scales based on:
- **CPU**: Target 70% utilization
- **Memory**: Target 80% utilization
- **Range**: 1-3 tasks (dev), 1-10 tasks (prod)

### Manual Scaling

Temporarily override auto-scaling:

```bash
# Scale to 2 tasks
aws ecs update-service \
  --cluster aistudio-dev \
  --service aistudio-dev \
  --desired-count 2
```

**Note**: Auto-scaling will eventually adjust based on metrics.

## Cost Optimization

### Development Environment

- **Fargate Spot**: Enabled for dev (up to 70% cost savings)
- **Small tasks**: 0.5 vCPU, 1GB memory
- **Auto-scaling**: Scales to zero during low usage (if configured)

### Production Environment

- **Fargate On-Demand**: Reliability over cost
- **Larger tasks**: 1 vCPU, 2GB memory
- **Reserved capacity**: Consider for predictable workloads

## Security

### Secrets Management

All secrets stored in AWS Secrets Manager:
- `AUTH_SECRET`: NextAuth encryption key
- RDS credentials: Database password

Accessed via:
- **Task Execution Role**: Injects secrets as environment variables
- **IAM permissions**: Scoped to specific secrets

### Network Security

- **VPC**: Isolated network
- **Security Groups**:
  - ALB: Allows 80/443 from internet
  - Tasks: Allow 3000 from ALB only
- **WAF**: Rate limiting and common attack protection

### Container Security

- **Read-only filesystem**: Enabled (except `/tmp`, cache dirs)
- **No root user**: Runs as `nextjs` user
- **Image scanning**: ECR scans on push
- **Minimal base image**: Node Alpine

## Maintenance

### Updating Dependencies

```bash
# Update CDK dependencies
cd infra
npm update

# Deploy updated infrastructure
./scripts/deploy-ecs-dev.sh
```

### Updating Application

```bash
# Make code changes
# ...

# Quick deploy
./infra/scripts/quick-deploy.sh
```

### Cleaning Up

```bash
# Destroy dev environment
cd infra
npx cdk destroy AIStudio-FrontendStack-Dev-Ecs

# Clean up ECR images
aws ecr list-images --repository-name aistudio-dev
aws ecr batch-delete-image --repository-name aistudio-dev --image-ids imageTag=old-tag
```

## Additional Resources

- **AWS ECS Documentation**: https://docs.aws.amazon.com/ecs/
- **CDK Documentation**: https://docs.aws.amazon.com/cdk/
- **Container Insights**: https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/ContainerInsights.html
- **Project CLAUDE.md**: `./CLAUDE.md` for project conventions

## Support

For issues or questions:
1. Check CloudWatch Logs
2. Review CloudWatch Alarms
3. Consult troubleshooting section above
4. Check GitHub Issues: https://github.com/psd401/aistudio.psd401.ai/issues
