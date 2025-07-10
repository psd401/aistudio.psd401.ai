# Deployment Guide

## GitHub Token Setup for Amplify/CDK
To connect AWS Amplify to your GitHub repository via CDK, you need a GitHub Personal Access Token (PAT):

1. Go to [GitHub Settings > Developer settings > Personal access tokens > Fine-grained tokens](https://github.com/settings/tokens?type=beta).
2. Click **Generate new token**.
3. Name it (e.g., `ai`), set an expiration (90 days recommended).
4. Select the following settings:
   - **Resource owner:** Your user or organization (must own the repo)
   - **Repository access:** Only select repositories (choose your Amplify repo)
   - **Permissions:**
     - **Repository permissions:**
       - Contents: Read and write
       - Metadata: Read-only
       - Webhooks: Read and write
     - **Account permissions:**
       - Read-only for user profile (if available)
5. Generate and copy the token (you won't see it again).
6. In AWS Secrets Manager, create a secret named `aistudio-github-token` with the token as the value (plain string).

> **Note:** If your organization restricts fine-grained PATs or you encounter issues, you may need to use a classic PAT as a fallback. See [GitHub's documentation](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens) and [AWS Amplify GitHub integration docs](https://docs.aws.amazon.com/amplify/latest/userguide/setting-up-GitHub-access.html) for the latest guidance.

## Google OAuth Setup for Cognito
To enable Google login in Cognito, you need OAuth credentials from Google:

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials).
2. Create a new project (or select an existing one).
3. Go to **APIs & Services > Credentials**.
4. Click **Create Credentials > OAuth client ID**.
5. Choose **Web application**.
6. Set the following:
   - **Authorized JavaScript origins:**
     - `http://localhost:3000`
     - `https://dev.<yourdomain>` (replace `<yourdomain>` with your domain)
     - `https://prod.<yourdomain>` (replace `<yourdomain>` with your domain)
   - **Authorized redirect URIs:**
     - `https://<your-cognito-domain>/oauth2/idpresponse` 
       - Replace `<your-cognito-domain>` with the domain of your Cognito User Pool (e.g., `aistudio-dev.auth.us-east-1.amazoncognito.com`). You can find this in your AWS Cognito User Pool settings after deployment.
7. Save and copy the **Client ID** and **Client Secret**.
8. In AWS Secrets Manager, create two secrets:
   - `aistudio-dev-google-oauth` (JSON: `{ "clientSecret": "..." }`)
   - `aistudio-prod-google-oauth` (JSON: `{ "clientSecret": "..." }`)
   - **Do NOT store the client ID in Secrets Manager.**
   - You will provide the client ID as a parameter at deploy time (see below).

---

This guide explains how to deploy the full AWS infrastructure stack for this project using AWS CDK.

## Prerequisites
- AWS CLI installed and configured for the target account/role
- AWS CDK installed globally (`npm install -g aws-cdk`)
- Node.js and npm installed
- Required secrets created in AWS Secrets Manager:
  - `aistudio-dev-google-oauth` (JSON: `{ "clientSecret": "..." }`)
  - `aistudio-prod-google-oauth` (JSON: `{ "clientSecret": "..." }`)
  - `aistudio-github-token` (string: GitHub personal access token)
- Google OAuth client IDs (for dev and prod) ready to provide as parameters
- **Base domain** (e.g., `yourdomain.com`) must be provided as a context variable for the frontend stack. **No hardcoded domains are used.**

## Cost Allocation Tags for Billing
To track costs by project, environment, or owner in AWS Cost Explorer and billing reports, you must activate cost allocation tags in the AWS Billing Console:

1. Go to the [AWS Billing Console](https://console.aws.amazon.com/billing/).
2. In the left menu, click **Cost allocation tags**.
3. Find your tags (e.g., `Project`, `Owner`, `Environment`) in the list.
4. Select the checkboxes for the tags you want to activate.
5. Click **Activate**.
6. It may take up to 24 hours for the tags to appear in Cost Explorer and billing reports.

> **Note:** Tagging in CDK is necessary, but not sufficient—you must activate the tags in the AWS Billing Console for cost reporting.

> **Important:** If you have previously deployed stacks without the `AIStudio-` prefix, you must destroy them before deploying the new stacks. Use `cdk list` to see all stacks, and `cdk destroy ...` to remove the old ones.

## 1. Install Dependencies
```sh
npm install
```

## 2. Bootstrap the CDK Environment
```sh
cd infra
cdk bootstrap
```

## 3. Synthesize the CDK Stacks
```sh
cdk synth --context baseDomain=yourdomain.com
```

## 4. Destroy Old Stacks (if renaming)
If you previously deployed stacks without the `AIStudio-` prefix, destroy them first:
```sh
cdk destroy DatabaseStack-Dev AuthStack-Dev StorageStack-Dev FrontendStack-Dev \
  DatabaseStack-Prod AuthStack-Prod StorageStack-Prod FrontendStack-Prod InfraStack \
  --context baseDomain=yourdomain.com
```

## 5. Deploy Stacks
### Deploy all dev stacks (with Google client ID and base domain context):
```sh
cdk deploy AIStudio-DatabaseStack-Dev AIStudio-AuthStack-Dev AIStudio-StorageStack-Dev AIStudio-FrontendStack-Dev \
  --parameters AIStudio-AuthStack-Dev:GoogleClientId=your-dev-client-id \
  --context baseDomain=yourdomain.com
```
### Deploy all prod stacks (with Google client ID and base domain context):
```sh
cdk deploy AIStudio-DatabaseStack-Prod AIStudio-AuthStack-Prod AIStudio-StorageStack-Prod AIStudio-FrontendStack-Prod \
  --parameters AIStudio-AuthStack-Prod:GoogleClientId=your-prod-client-id \
  --context baseDomain=yourdomain.com
```
### Or deploy everything (provide all parameters and context):
```sh
cdk deploy --all \
  --parameters AIStudio-AuthStack-Dev:GoogleClientId=your-dev-client-id \
  --parameters AIStudio-AuthStack-Prod:GoogleClientId=your-prod-client-id \
  --context baseDomain=yourdomain.com
```

### Subdomain Pattern
- **Dev:** Amplify will use `dev.<yourdomain>`
- **Prod:** Amplify will use `prod.<yourdomain>`
- **Apex/root domain:** If you want your root domain (e.g., `yourdomain.com`) to point to the Amplify app, set up a CNAME or ALIAS at your DNS provider pointing the apex to the prod subdomain (`prod.<yourdomain>`). See your DNS provider's documentation for apex/ALIAS/CNAME support.
- **Note:** The domain is always parameterized. There are no hardcoded domains in the codebase.

## 6. Stack Outputs
After deployment, find resource outputs (Cognito, S3, RDS, Amplify) in the CloudFormation console or CLI output.

## 7. Environment Variables
Update your application's `.env.local` with the outputs and any required AWS resource references.

## 8. Troubleshooting
- Ensure your AWS credentials are correct and have sufficient permissions.
- If you see errors about missing secrets, create them in AWS Secrets Manager as described above.
- For IAM changes, CDK may prompt for approval—review and approve as needed.
- If you see errors about missing parameters, provide the required Google client ID(s) and base domain as shown above.
- If you see errors about domains not containing subdomains, ensure you are not using the apex/root domain and that your base domain is correct.
- If you see an error about missing context variable `baseDomain`, add `--context baseDomain=yourdomain.com` to your command.

## 9. Clean Up
To remove all resources (dev only):
```sh
cdk destroy --all --context baseDomain=yourdomain.com
```

See `OPERATIONS.md` for ongoing management and monitoring.

## 10. Configure SSR Compute Role
AWS Amplify WEB_COMPUTE requires an SSR Compute role for runtime AWS access:

1. The CDK automatically creates this role during deployment
2. Check the stack outputs for `SSRComputeRoleArn`
3. Verify in Amplify Console → App settings → IAM roles that the SSR Compute role is attached
4. Without this role, you'll get "Could not load credentials from any providers" errors

## 11. NextAuth v5 Environment Variables
After deploying the stacks, you must set these environment variables in AWS Amplify console:

### Critical for Authentication:
- `AUTH_URL` - Must match your deployment URL:
  - Dev: `https://dev.<yourdomain>`
  - Prod: `https://prod.<yourdomain>`
- `AUTH_SECRET` - Generate with `openssl rand -base64 32`
- `AUTH_COGNITO_CLIENT_ID` - From Auth stack outputs
- `AUTH_COGNITO_ISSUER` - Format: `https://cognito-idp.<region>.amazonaws.com/<user-pool-id>`

### Other Required Variables:
These are output by the CDK stacks and must be set in Amplify:
- `NEXT_PUBLIC_COGNITO_USER_POOL_ID`
- `NEXT_PUBLIC_COGNITO_CLIENT_ID`
- `NEXT_PUBLIC_COGNITO_DOMAIN`
- `NEXT_PUBLIC_AWS_REGION`
- `RDS_RESOURCE_ARN`
- `RDS_SECRET_ARN`
- `SQL_LOGGING` - Set to `false` for production

## 12. First Administrator Setup
After deploying the application, the first user who signs up needs to be granted administrator privileges:

1. **Sign up as the first user** through the web interface
2. **Connect to your RDS database** using AWS Query Editor or a PostgreSQL client
3. **Find your user ID** by running:
   ```sql
   SELECT id, email, cognito_sub FROM users WHERE email = 'your-email@example.com';
   ```
4. **Check if admin role exists**:
   ```sql
   SELECT id FROM roles WHERE name = 'administrator';
   ```
   If it doesn't exist, create it:
   ```sql
   INSERT INTO roles (name, description) VALUES ('administrator', 'Administrator role with full access');
   ```
5. **Assign the admin role** to your user:
   ```sql
   INSERT INTO user_roles (user_id, role_id) 
   SELECT u.id, r.id 
   FROM users u, roles r 
   WHERE u.email = 'your-email@example.com' AND r.name = 'administrator';
   ```

Alternatively, you can use the RDS Query Editor in AWS Console:
1. Navigate to RDS → Query Editor
2. Connect using your cluster ARN and secret ARN
3. Select the `aistudio` database
4. Run the SQL commands above