# Migration Notes: AWS Amplify to NextAuth

## Problem Solved
AWS Amplify's `@aws-amplify/adapter-nextjs` has compatibility issues with Next.js 15, causing 500 errors on all routes. The adapter only supports Next.js versions <15.0.0.

## Solution Implemented
Migrated from AWS Amplify authentication to NextAuth.js (v5) with AWS Cognito provider.

## Migration Steps Completed

### 1. Installed NextAuth v5
- Added `next-auth@beta` package
- Created NextAuth configuration at `/auth.ts`
- Updated API route at `/app/api/auth/[...nextauth]/route.ts` to use v5 handlers
- Configured Cognito provider with PKCE and nonce support

### 2. Updated Middleware
- Replaced custom JWT validation with NextAuth middleware
- Updated public paths configuration
- Maintained protected route logic

### 3. Fixed Authentication Flow Issues
- **Session Cookie Size**: Limited JWT data to essential fields only (reduced from 6256 to ~500 bytes)
- **Sign-out Flow**: Updated to use `signOut({ redirect: false })` with manual redirect
- **Sign-in Page**: Replaced auto-redirect with manual sign-in UI
- **Landing Page**: Added delay to prevent redirect during sign-out

### 4. Updated Components
- **SessionProvider**: Replaced AmplifyProvider with NextAuth SessionProvider in root layout
- **UserButton**: Updated to use `useSession` hook and NextAuth sign-in/out methods
- **Server Session**: Updated `/lib/auth/server-session.ts` to use NextAuth's getServerSession

### 5. Updated API Routes
All API routes updated from Cognito cookie checks to NextAuth session validation:
- `/api/navigation/route.ts`
- `/api/admin/users/route.ts`
- `/api/admin/users/[userId]/route.ts`
- `/api/admin/users/[userId]/role/route.ts`
- `/api/admin/models/route.ts`

### 6. Environment Variables
Required environment variables:
```
AUTH_URL=http://localhost:3000
AUTH_SECRET=<generate with: openssl rand -base64 32>
AUTH_COGNITO_CLIENT_ID=<your-client-id>
AUTH_COGNITO_ISSUER=https://cognito-idp.<region>.amazonaws.com/<user-pool-id>
NEXT_PUBLIC_COGNITO_USER_POOL_ID=<your-pool-id>
NEXT_PUBLIC_COGNITO_CLIENT_ID=<your-client-id>
NEXT_PUBLIC_COGNITO_DOMAIN=<your-domain>.auth.<region>.amazoncognito.com
NEXT_PUBLIC_AWS_REGION=<your-region>
```

### 7. Cognito Configuration
Add these callback URLs to your Cognito app client:
- `http://localhost:3000/api/auth/callback/cognito`
- `https://dev.aistudio.psd401.ai/api/auth/callback/cognito`
- `https://aistudio.psd401.ai/api/auth/callback/cognito`

## TypeScript Types
Created `/types/next-auth.d.ts` to extend NextAuth types with custom session properties.

## Known Issues Resolved
1. ✅ Session cookie too large (chunking issue)
2. ✅ Sign-out not working (redirected back to dashboard)
3. ✅ Auto sign-in preventing manual control
4. ✅ API routes returning 401 unauthorized
5. ✅ User name not displaying (shows email instead)

## Notes for Deployment
1. Set `AUTH_URL` to your production URL in AWS Amplify console
2. Generate a secure `AUTH_SECRET` for production
3. Update CDK to include NextAuth v5 environment variables
4. Ensure Cognito callback URLs are configured for all environments
5. Add Cognito logout URLs in CDK configuration

## Rollback Instructions
If needed to rollback to Amplify auth:
1. Restore `middleware.ts.bak`
2. Restore AmplifyProvider in layout
3. Revert API routes to use Cognito cookie checks
4. Remove NextAuth configuration files