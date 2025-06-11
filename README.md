# Enterprise Next.js Template

A modern, production-ready template for building internal enterprise applications with Next.js 14+, featuring:

- 🔒 Authentication with [Clerk](https://clerk.com)
- 🗄️ Database with [Drizzle ORM](https://orm.drizzle.team) + [Supabase](https://supabase.com)
- 🎨 UI with [Shadcn](https://ui.shadcn.com)
- 🚀 Deployment with [AWS Amplify](https://aws.amazon.com/amplify)

## AWS Architecture (2025 Migration)

This project provisions all core infrastructure using AWS CDK, following the AWS Well-Architected Framework and best practices for cost tracking and security:

- **Networking:** Isolated VPC with public and private subnets
- **Database:** Aurora Serverless v2 PostgreSQL with RDS Proxy and Secrets Manager
- **Authentication:** Amazon Cognito with Google federated login
- **Storage:** Private S3 bucket for document storage (SSE, versioning, lifecycle)
- **Frontend Hosting:** AWS Amplify (connected to GitHub, custom domain, environment variables)
- **Tagging:** All resources are tagged for cost allocation (Environment, Project, Owner)

See `DEPLOYMENT.md` for full deployment instructions and `OPERATIONS.md` for operational best practices.

## Features

- Role-based access control
- Automatic user creation on first sign-in
- Modern, responsive UI
- Type-safe database operations
- Test-driven development setup

## Getting Started

1. Clone the repository
2. Copy `.env.example` to `.env.local` and fill in your environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Install dependencies:
   ```bash
   npm install
   ```

4. Set up your database:
   ```bash
   npm run db:generate
   npm run db:push
   ```

5. Run the development server:
   ```bash
   npm run dev
   ```

## Testing

Run the test suite:
```bash
npm test
```

Watch mode:
```bash
npm run test:watch
```

## Database Management

- Generate migrations: `npm run db:generate`
- Push schema changes: `npm run db:push`
- Open Drizzle Studio: `npm run db:studio`

## Deployment

1. Set up an AWS Amplify project
2. Connect your repository
3. Configure environment variables in the Amplify Console
4. Deploy!

## License

MIT

# AIStudio AWS Infrastructure

This project provisions all AWS infrastructure for AIStudio using AWS CDK (TypeScript). It includes:

- **Networking & Database:** VPC, Aurora Serverless v2, RDS Proxy, Secrets Manager
- **Authentication:** Cognito User Pool (with Google OAuth via IdP), User Pool Client, User Pool Domain
- **Storage:** S3 bucket (private, versioned, encrypted)
- **Frontend Hosting:** Amplify App (GitHub integration, custom domain for dev/prod)
- **IAM Roles/Policies:** For least-privilege access
- **Tagging:** Cost allocation tags for all resources

## OAuth Credentials Management
- **Google OAuth Client IDs** are provided as CloudFormation parameters at deploy time (never hardcoded or stored in Secrets Manager). This is a public value and must be passed with `--parameters AuthStack-Dev:GoogleClientId=...` or `--parameters AuthStack-Prod:GoogleClientId=...` when deploying.
- **Google OAuth Client Secrets** are stored in AWS Secrets Manager (`aistudio-dev-google-oauth` and `aistudio-prod-google-oauth`).

## Frontend Domain Management
- The base domain is provided as a CDK context variable at deploy time (e.g., `yourdomain.com`) using `--context baseDomain=yourdomain.com`.
- The Amplify app will use `dev.<domain>` for dev and `prod.<domain>` for prod.
- If you want your root domain (e.g., `yourdomain.com`) to point to the Amplify app, set up a CNAME or ALIAS at your DNS provider pointing the apex to the prod subdomain (`prod.<domain>`).
- **Note:** The domain is always parameterized via context. There are no hardcoded domains in the codebase.

## Setup Overview
1. **Install dependencies:** `npm install`
2. **Bootstrap CDK:** `cd infra && cdk bootstrap`
3. **Create required secrets:** See `DEPLOYMENT.md` for details.
4. **Deploy stacks:** Use `cdk deploy` with the appropriate `--parameters` for Google client IDs and `--context baseDomain=yourdomain.com` (see below).

## Example Deployment
```sh
cd infra
cdk deploy --all \
  --parameters AuthStack-Dev:GoogleClientId=your-dev-client-id \
  --parameters AuthStack-Prod:GoogleClientId=your-prod-client-id \
  --context baseDomain=yourdomain.com
```

See `DEPLOYMENT.md` for full deployment instructions and `OPERATIONS.md` for ongoing management.
