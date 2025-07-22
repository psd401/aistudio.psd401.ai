# Operations Guide

This guide covers ongoing operations, monitoring, and management for the AWS infrastructure provisioned by this project.

## Monitoring
- **CloudWatch:**
  - All AWS resources emit logs and metrics to CloudWatch.
  - Set up CloudWatch Alarms for RDS, S3, and Cognito as needed (e.g., high error rates, storage thresholds).
- **Amplify:**
  - Monitor build and deployment status in the AWS Amplify Console.

## Backups & Data Retention
- **Aurora (RDS):**
  - Automated backups are enabled (7 days for prod, 1 day for dev).
  - Snapshots can be created manually via the RDS console.
  - Multi-AZ is enabled for production for high availability.
- **S3:**
  - Versioning is enabled for the documents bucket.
  - Lifecycle policy deletes old versions after 30 days.

## User Management
- **Cognito:**
  - Manage users and groups in the AWS Cognito Console.
  - Federated users (Google) are managed via Cognito.
  - User Pool settings (password policy, MFA, etc.) can be updated in the console or via CDK.

## Cost Tracking
- All resources are tagged with `Environment`, `Project`, and `Owner` for cost allocation.
- Activate these tags as Cost Allocation Tags in the AWS Billing console.
- Review AWS Cost Explorer for usage and cost breakdowns.

## Security & Compliance
- **Google OAuth client IDs are public and provided as CloudFormation parameters at deploy time. Never store client IDs in Secrets Manager or hardcode them.**
- **Google OAuth client secrets and GitHub tokens are stored in AWS Secrets Manager.**
- Principle of least privilege: IAM roles/policies grant only required access
- S3 buckets are private, encrypted, and block public access
- RDS credentials are never exposed; use Secrets Manager and RDS Proxy

## Secrets Management
- All secrets (Google OAuth client secrets, GitHub tokens) are managed in AWS Secrets Manager
- **Do not store public config (like OAuth client IDs) as secrets**
- Rotate secrets regularly and update stack parameters as needed

## Troubleshooting
- If Cognito Google login fails, check:
  - The correct client ID was provided as a parameter at deploy time
  - The client secret in Secrets Manager matches the Google Cloud Console value
  - Redirect URIs in Google Cloud Console match the deployed environment
- If stack deployment fails due to missing parameters, provide the required client ID(s) with `--parameters`
- For missing secrets, create them in AWS Secrets Manager as documented in `DEPLOYMENT.md` (in this directory)

## Disaster Recovery
- Restore RDS from automated or manual snapshots as needed.
- S3 versioning allows recovery of deleted/overwritten documents within the retention window.
- Amplify: redeploy frontend from GitHub

## Updates & Maintenance
- Update infrastructure via CDK and redeploy as needed.
- Review CloudFormation stack events for errors or drift.

For deployment instructions, see `DEPLOYMENT.md` (in this directory). For development, see `../DEVELOPER_GUIDE.md` (in the root directory). 