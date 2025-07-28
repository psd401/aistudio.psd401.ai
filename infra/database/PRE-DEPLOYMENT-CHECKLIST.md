# Pre-Deployment Database Safety Checklist

**⚠️ STOP! Complete this checklist BEFORE deploying ⚠️**

## Environment Check
- [ ] Confirm deployment environment: `Dev` or `Prod`
- [ ] Verify you're in the correct AWS account
- [ ] Check current branch is correct

## Database State Verification
- [ ] Aurora HTTP endpoint is **ENABLED**
  ```bash
  aws rds describe-db-clusters --db-cluster-identifier <cluster-id> \
    --query 'DBClusters[0].EnableHttpEndpoint'
  ```

## Migration Review
- [ ] List migrations that will run:
  ```bash
  grep "MIGRATION_FILES = \[" -A10 infra/database/lambda/db-init-handler.ts
  ```
- [ ] Check migration status in database (use MCP tools)
- [ ] Review each NEW migration file for safety

## SQL File Verification
- [ ] NO DROP statements without IF EXISTS
- [ ] NO TRUNCATE statements  
- [ ] All CREATE statements use IF NOT EXISTS
- [ ] All ALTER TABLE ADD COLUMN use IF NOT EXISTS

## Code Changes
- [ ] db-init-handler.ts version bumped (if SQL files changed)
- [ ] Lambda rebuilt: `cd infra/database/lambda && npm run build`
- [ ] CDK rebuilt: `cd infra && npm run build`

## Final Checks
- [ ] Do you have a recent database snapshot?
- [ ] Is someone available to help if something goes wrong?
- [ ] Have you tested on Dev first (if deploying to Prod)?

## Deploy Command
Only after ALL boxes checked:
```bash
cdk deploy AIStudio-DatabaseStack-[Environment] --context baseDomain=<domain>
```

## Post-Deployment Verification
- [ ] Check CloudWatch logs for Lambda execution
- [ ] Verify migrations completed in migration_log
- [ ] Test application functionality
- [ ] No errors in application logs

**If ANYTHING fails: STOP and investigate before proceeding!**