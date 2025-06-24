"use server"

import { cookies } from "next/headers";
import { CognitoJwtVerifier } from "aws-jwt-verify";
import { runWithAmplifyServerContext } from "@/app/utils/amplifyServerUtils";
import { fetchAuthSession } from "aws-amplify/auth/server";

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
 * Gets the current authenticated session using AWS Amplify's server utilities.
 * This handles token refresh automatically if needed.
 */
export async function getServerSession(): Promise<CognitoSession | null> {
  try {
    // First try to use Amplify's server context which handles token refresh
    const session = await runWithAmplifyServerContext({
      nextServerContext: { cookies },
      operation: async (contextSpec) => {
        try {
          const authSession = await fetchAuthSession(contextSpec);
          if (!authSession?.tokens?.idToken) {
            return null;
          }
          
          // Parse the ID token payload
          const payload = authSession.tokens.idToken.payload;
          return {
            sub: payload.sub as string,
            email: payload.email as string,
            ...payload
          } as CognitoSession;
        } catch (error) {
          // If Amplify fails, fall back to manual verification
          return null;
        }
      }
    });

    if (session) {
      return session;
    }

    // Fallback to manual token verification if Amplify context fails
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
      // Token expired or invalid - user needs to re-authenticate
      return null;
    }
  } catch (error) {
    console.error("Session retrieval failed:", error);
    return null;
  }
} 