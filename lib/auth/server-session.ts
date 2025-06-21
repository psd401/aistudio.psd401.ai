"use server"

import { cookies } from "next/headers";
import { CognitoJwtVerifier } from "aws-jwt-verify";

// Build a singleton verifier – expensive to instantiate, so keep at module level
const userPoolId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID!;
const clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID!;

// eslint-disable-next-line import/no-mutable-exports
let verifier: CognitoJwtVerifier | undefined;
function getVerifier() {
  if (!verifier) {
    verifier = CognitoJwtVerifier.create({
      userPoolId,
      tokenUse: "id",
      clientId,
    });
  }
  return verifier;
}

export interface CognitoSession {
  sub: string;
  email?: string;
  [key: string]: unknown;
}

/**
 * Reads the Cognito id-token from Amplify's cookie system and verifies it.
 * AWS Amplify stores the ID token in a cookie with pattern:
 * CognitoIdentityServiceProvider.{clientId}.{username}.idToken
 */
export async function getServerSession(): Promise<CognitoSession | null> {
  const cookieStore = await cookies();
  
  // Get all cookies and find the Amplify ID token
  const allCookies = cookieStore.getAll();
  const idTokenCookie = allCookies.find(cookie => 
    cookie.name.includes(`CognitoIdentityServiceProvider.${clientId}`) && 
    cookie.name.endsWith('.idToken')
  );

  if (!idTokenCookie) return null;

  try {
    const payload = (await getVerifier().verify(idTokenCookie.value)) as CognitoSession;
    return payload;
  } catch (error) {
    console.error("Token verification failed:", error);
    return null;
  }
} 