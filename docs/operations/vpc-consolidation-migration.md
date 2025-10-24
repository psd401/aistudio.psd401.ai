# VPC Consolidation Migration Guide

**Epic:** #372 - VPC Consolidation
**Purpose:** Migrate from separate VPCs per stack to a shared VPC architecture to reduce costs and improve security
**Date:** October 2025
**Author:** Kris Hagel

## Overview

This guide documents the process of migrating the AI Studio infrastructure from individual VPCs to a consolidated shared VPC architecture. The migration involves restoring the Aurora database from a snapshot to preserve all production data while deploying the new infrastructure.

## Cost Benefits

- **Before:** Each stack (Database, ECS, etc.) had its own VPC with NAT gateways (~$45-90/month per environment)
- **After:** Single shared VPC per environment (one set of NAT gateways)
- **Savings:** Estimated $45-90/month per environment

## Prerequisites

1. **Snapshot the database** before starting:
   ```bash
   # Take a manual snapshot
   aws rds create-db-cluster-snapshot \
     --db-cluster-identifier aistudio-{env}-cluster \
     --db-cluster-snapshot-identifier pre-vpc-migration-$(date +%Y%m%d-%H%M%S)
   ```

2. **Verify snapshot completion:**
   ```bash
   aws rds describe-db-cluster-snapshots \
     --db-cluster-snapshot-identifier {snapshot-id} \
     --query 'DBClusterSnapshots[0].{Status:Status,Engine:Engine,EngineVersion:EngineVersion,SnapshotCreateTime:SnapshotCreateTime}'
   ```

3. **Verify current cluster configuration:**
   ```bash
   aws rds describe-db-clusters \
     --db-cluster-identifier aistudio-{env}-cluster \
     --query 'DBClusters[0].{Engine:Engine,EngineVersion:EngineVersion,ServerlessV2:ServerlessV2ScalingConfiguration}'
   ```

## Architecture Changes

### VPC Provider Pattern

The new architecture uses a `VPCProvider` singleton pattern (`/infra/lib/constructs/network/vpc-provider.ts`):

- **First stack (DatabaseStack)** creates the VPC and stores metadata in SSM Parameter Store
- **Subsequent stacks** import the VPC using runtime SSM lookups via `AwsCustomResource`
- **No circular dependencies** - uses SSM instead of CloudFormation exports

### Database Stack Modifications

The `DatabaseStack` (`/infra/lib/database-stack.ts`) was modified to support conditional snapshot restoration:

**Key Changes:**
1. Changed cluster type from `rds.DatabaseCluster` to `rds.IDatabaseCluster` (line 26)
2. Added snapshot restoration logic using L1 `CfnDBCluster` construct (lines 73-172)
3. Made RDS Proxy, Cost Optimizer, Cost Dashboard, and db-init Lambda conditional (skipped during snapshot restoration)
4. Uses context parameter `snapshotIdentifier` to trigger restoration mode

## Migration Process

### Step 1: Prepare Code for Snapshot Restoration

The code changes are already in place in `/infra/lib/database-stack.ts`. The key sections are:

```typescript
// Line 74: Check for snapshot restoration context
const snapshotId = this.node.tryGetContext('snapshotIdentifier');
const restoreFromSnapshot = snapshotId !== undefined;

if (restoreFromSnapshot) {
  // Lines 82-132: Use L1 CfnDBCluster to restore from snapshot
  // Note: Snapshot contains schema and data, so db-init Lambda is skipped
}
```

### Step 2: Destroy Existing Stacks

Destroy stacks in reverse dependency order:

```bash
cd infra

# Destroy dependent stacks first
npx cdk destroy AIStudio-FrontendStack-ECS-{Env} --force
npx cdk destroy AIStudio-DocumentProcessingStack-{Env} --force
npx cdk destroy AIStudio-SchedulerStack-{Env} --force

# Destroy database stack last
npx cdk destroy AIStudio-DatabaseStack-{Env} --force
```

**Important:** Wait for all stacks to complete deletion before proceeding.

### Step 3: Clean Up Orphaned Resources

CloudWatch Log Groups may not be fully deleted immediately. Check and delete manually if needed:

```bash
# Check for orphaned log groups
aws logs describe-log-groups --log-group-name-prefix "/aws/lambda/vpc-ssm-cleanup" --query 'logGroups[*].logGroupName'
aws logs describe-log-groups --log-group-name-prefix "/aws/lambda/db-init" --query 'logGroups[*].logGroupName'

# Delete if they exist
aws logs delete-log-group --log-group-name /aws/lambda/vpc-ssm-cleanup-provider-{env}
aws logs delete-log-group --log-group-name /aws/lambda/db-init-provider-{env}
```

### Step 4: Deploy Database Stack with Snapshot Restoration

Deploy the database stack with the snapshot context parameter:

```bash
npx cdk deploy AIStudio-DatabaseStack-{Env} \
  --context snapshotIdentifier={snapshot-id} \
  --require-approval never
```

**What happens:**
- VPC is created with shared architecture
- Aurora cluster is restored from snapshot (preserves all data)
- Security groups, subnet groups, and networking are configured
- SSM parameters are created for cross-stack references
- db-init Lambda is skipped (snapshot already has schema and data)

### Step 5: Update Database Credentials

The snapshot preserves the original password, but the new stack creates a new secret. Update the cluster password to match the new secret:

```bash
# Get new password from secret
SECRET_ARN=$(aws ssm get-parameter --name /aistudio/{env}/db-secret-arn --query 'Parameter.Value' --output text)
NEW_PASSWORD=$(aws secretsmanager get-secret-value --secret-id $SECRET_ARN --query 'SecretString' --output text | jq -r '.password')

# Update cluster password
aws rds modify-db-cluster \
  --db-cluster-identifier aistudio-{env}-cluster \
  --master-user-password "$NEW_PASSWORD" \
  --apply-immediately

# Wait for credential reset to complete (about 60 seconds)
aws rds describe-db-clusters \
  --db-cluster-identifier aistudio-{env}-cluster \
  --query 'DBClusters[0].Status'
# Wait until status returns "available"
```

### Step 6: Verify Database Connectivity and Data

Test the Data API and verify data integrity:

```bash
# Get ARNs from SSM
CLUSTER_ARN=$(aws ssm get-parameter --name /aistudio/{env}/db-cluster-arn --query 'Parameter.Value' --output text)
SECRET_ARN=$(aws ssm get-parameter --name /aistudio/{env}/db-secret-arn --query 'Parameter.Value' --output text)

# List tables
aws rds-data execute-statement \
  --resource-arn "$CLUSTER_ARN" \
  --secret-arn "$SECRET_ARN" \
  --database "aistudio" \
  --sql "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;" \
  --output json | jq '.records[] | .[0].stringValue'

# Verify data counts
aws rds-data execute-statement \
  --resource-arn "$CLUSTER_ARN" \
  --secret-arn "$SECRET_ARN" \
  --database "aistudio" \
  --sql "SELECT COUNT(*) as count FROM users;" \
  --output json | jq '.records[0][0].longValue'
```

### Step 7: Deploy Remaining Stacks

Deploy stacks in dependency order, **always including the snapshot context**:

```bash
# Deploy SchedulerStack
npx cdk deploy AIStudio-SchedulerStack-{Env} \
  --context snapshotIdentifier={snapshot-id} \
  --require-approval never

# Deploy DocumentProcessingStack
npx cdk deploy AIStudio-DocumentProcessingStack-{Env} \
  --context snapshotIdentifier={snapshot-id} \
  --require-approval never

# Deploy FrontendStack-ECS
npx cdk deploy AIStudio-FrontendStack-ECS-{Env} \
  --context snapshotIdentifier={snapshot-id} \
  --context baseDomain=aistudio.psd401.ai \
  --require-approval never
```

**Why include snapshot context for all stacks?**
The snapshot context ensures the DatabaseStack doesn't try to add resources (like RDS Proxy, Cost Optimizer) that are incompatible with the imported cluster. This keeps the stack in "snapshot restoration mode."

### Step 8: Understanding Snapshot Context (Important!)

**IMPORTANT:** After migrating with snapshot restoration, you should **continue using the snapshot context** for all future deployments to this environment. Here's why:

**Why keep the snapshot context:**
- The cluster was created using L1 `CfnDBCluster` construct (low-level CloudFormation)
- L2 features (RDS Proxy, Cost Optimizer, Cost Dashboard) are incompatible with imported clusters
- Removing the context would try to add L2 resources, creating CloudFormation export conflicts
- The imported cluster works perfectly for all application needs

**What this means:**
- Always include `--context snapshotIdentifier={snapshot-id}` when deploying this environment
- The snapshot context becomes a permanent part of this environment's configuration
- This is not a limitation - it's the correct architecture for migrated environments

**Future Database Migrations:**
- The db-init Lambda is skipped in snapshot mode (snapshot already has schema)
- For schema changes, use traditional migration tools or manual SQL scripts
- For fresh environments (new dev/staging), omit snapshot context to get full L2 features

**Alternative (Not Recommended):**
If you absolutely need L2 features (Proxy, Cost Optimizer), you would need to:
1. Take a final snapshot
2. Destroy ALL dependent stacks (Frontend, Scheduler, DocumentProcessing, Database)
3. Deploy DatabaseStack without snapshot context (creates fresh L2 cluster)
4. Restore data from snapshot manually using `pg_restore` or similar tools
5. Redeploy all dependent stacks

This is complex and risky - the snapshot restoration mode is the recommended approach.

### Step 9: Update Local Environment Variables

A template file has been created at `/.env.local.template` with all necessary environment variables.

**Quick setup:**
```bash
# Copy template to .env.local
cp .env.local.template .env.local

# Get secrets from AWS and update .env.local
# AUTH_SECRET
aws secretsmanager get-secret-value \
  --secret-id arn:aws:secretsmanager:us-east-1:390844780692:secret:aistudio-{env}-auth-secret-* \
  --query 'SecretString' --output text | jq -r '.AUTH_SECRET'

# INTERNAL_API_SECRET
aws secretsmanager get-secret-value \
  --secret-id arn:aws:secretsmanager:us-east-1:390844780692:secret:aistudio-{env}-internal-api-secret-* \
  --query 'SecretString' --output text | jq -r '.INTERNAL_API_SECRET'
```

**Get all stack outputs (for reference):**
```bash
echo "=== Database Stack ===" && \
aws cloudformation describe-stacks --stack-name AIStudio-DatabaseStack-{Env} --query 'Stacks[0].Outputs[*].{Key:OutputKey,Value:OutputValue}' --output table && \
echo "" && \
echo "=== Auth Stack ===" && \
aws cloudformation describe-stacks --stack-name AIStudio-AuthStack-{Env} --query 'Stacks[0].Outputs[*].{Key:OutputKey,Value:OutputValue}' --output table && \
echo "" && \
echo "=== Storage Stack ===" && \
aws cloudformation describe-stacks --stack-name AIStudio-StorageStack-{Env} --query 'Stacks[0].Outputs[*].{Key:OutputKey,Value:OutputValue}' --output table && \
echo "" && \
echo "=== Scheduler Stack ===" && \
aws cloudformation describe-stacks --stack-name AIStudio-SchedulerStack-{Env} --query 'Stacks[0].Outputs[*].{Key:OutputKey,Value:OutputValue}' --output table && \
echo "" && \
echo "=== Document Processing Stack ===" && \
aws cloudformation describe-stacks --stack-name AIStudio-DocumentProcessingStack-{Env} --query 'Stacks[0].Outputs[*].{Key:OutputKey,Value:OutputValue}' --output table && \
echo "" && \
echo "=== Frontend Stack ===" && \
aws cloudformation describe-stacks --stack-name AIStudio-FrontendStack-ECS-{Env} --query 'Stacks[0].Outputs[*].{Key:OutputKey,Value:OutputValue}' --output table
```

## Troubleshooting

### Issue: CloudWatch Log Group Already Exists

**Error:**
```
Resource handler returned message: "Resource of type 'AWS::Logs::LogGroup' with identifier '{"/properties/LogGroupName":"/aws/lambda/vpc-ssm-cleanup-provider-{env}"}' already exists."
```

**Solution:**
```bash
aws logs delete-log-group --log-group-name /aws/lambda/vpc-ssm-cleanup-provider-{env}
aws logs delete-log-group --log-group-name /aws/lambda/db-init-provider-{env}
```

### Issue: Password Authentication Failed After Snapshot Restore

**Cause:** Snapshot preserves original password, but new secret has different password.

**Solution:** Follow Step 5 to update cluster password.

### Issue: Missing CloudFormation Exports

**Error:**
```
No export named AIStudio-DatabaseStack-{Env}:ExportsOutputRefAuroraCluster... found.
```

**Cause:** Snapshot restoration uses L1 constructs which create different CloudFormation resources.

**Solution:** Always include `--context snapshotIdentifier={snapshot-id}` when deploying dependent stacks during migration.

## Environment-Specific Notes

### Development Environment
- Uses Fargate Spot for cost optimization
- Single NAT gateway
- Auto-pause enabled for Aurora (when not in snapshot mode)
- DNS: `dev-ecs.aistudio.psd401.ai`

### Production Environment
- Uses on-demand Fargate
- NAT gateways in each AZ (3 total)
- Auto-pause disabled, scheduled scaling enabled
- DNS: `aistudio.psd401.ai`
- Multi-AZ deployment

## Validation Checklist

After migration, verify:

- [ ] Database cluster is `available`
- [ ] Data API is enabled
- [ ] All tables are present (54 tables expected)
- [ ] Data counts match pre-migration (users, conversations, messages)
- [ ] ECS service is `ACTIVE` with running tasks
- [ ] Application is accessible via HTTPS
- [ ] Authentication works (Cognito login)
- [ ] Document processing works (upload test)
- [ ] Scheduled executions work (create test schedule)

## Rollback Plan

If issues occur:

1. **Restore from snapshot** (if database is corrupted):
   ```bash
   aws rds restore-db-cluster-from-snapshot \
     --db-cluster-identifier aistudio-{env}-cluster-rollback \
     --snapshot-identifier {snapshot-id} \
     --engine aurora-postgresql \
     --engine-version 15.12
   ```

2. **Redeploy old stacks** (if infrastructure fails):
   - Checkout previous commit before VPC consolidation
   - Deploy old stacks from previous code

## Production Migration Timeline

**Recommended approach:**

1. **Week 1:** Complete dev migration and validate (✅ Done)
2. **Week 2:** Monitor dev environment for issues
3. **Week 3:** Create prod snapshot and perform migration during maintenance window
4. **Week 4:** Monitor prod and remove snapshot context

**Maintenance Window Requirements:**
- Estimated downtime: 30-45 minutes
- Best time: Weekend or off-hours
- Rollback time: 15-20 minutes if needed

## References

- Epic #372: VPC Consolidation
- `/infra/lib/database-stack.ts` - Database stack with snapshot restoration
- `/infra/lib/constructs/network/vpc-provider.ts` - VPC sharing implementation
- `/infra/lib/constructs/network/shared-vpc.ts` - Shared VPC configuration
