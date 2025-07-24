import { CognitoJwtVerifier } from "aws-jwt-verify";
import { cookies } from "next/headers";

// Create verifier instance - this is cached and reused
const verifier = CognitoJwtVerifier.create({
  userPoolId: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID || "",
  tokenUse: "id",
  clientId: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID || "",
});

export interface JWTPayload {
  sub: string;
  email?: string;
  email_verified?: boolean;
  [key: string]: unknown;
}

/**
 * Extract JWT token from cookies
 */
async function getTokenFromCookies(): Promise<string | null> {
  const cookieStore = await cookies();
  const clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID || "";
  
  // Try different cookie patterns where Cognito might store the token
  const cookiePatterns = [
    `CognitoIdentityServiceProvider.${clientId}.idToken`,
    `CognitoIdentityServiceProvider.${clientId}.accessToken`,
    // Add more patterns if needed
  ];

  for (const pattern of cookiePatterns) {
    const token = cookieStore.get(pattern);
    if (token?.value) {
      return token.value;
    }
  }

  // Also check for custom auth cookies
  const authCookie = cookieStore.get("auth-token");
  if (authCookie?.value) {
    return authCookie.value;
  }

  return null;
}

/**
 * Validate JWT token without using Amplify adapter
 */
export async function validateJWT(): Promise<JWTPayload | null> {
  try {
    // Skip validation if required env vars are missing
    if (!process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID || !process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID) {
      // JWT validation skipped: Missing Cognito configuration
      return null;
    }

    const token = await getTokenFromCookies();
    if (!token) {
      return null;
    }

    // Verify the token
    const payload = await verifier.verify(token);
    
    return {
      ...payload,
      email: payload.email as string | undefined,
      email_verified: payload.email_verified as boolean | undefined,
    };
  } catch {
    // Token is invalid or expired
    // JWT validation failed - token is invalid or expired
    return null;
  }
}

/**
 * Simple session getter that doesn't depend on Amplify adapter
 */
export async function getSimpleSession(): Promise<JWTPayload | null> {
  return validateJWT();
}