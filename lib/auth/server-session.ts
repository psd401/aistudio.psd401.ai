"use server"

import { cookies } from "next/headers";
import { runWithAmplifyServerContext } from "@/app/utils/amplifyServerUtils";
import { fetchAuthSession } from "aws-amplify/auth/server";

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
    // ONLY use Amplify's official server context - no fallbacks
    const session = await runWithAmplifyServerContext({
      nextServerContext: { cookies },
      operation: async (contextSpec) => {
        try {
          const authSession = await fetchAuthSession(contextSpec);
          
          // Strict validation - must have valid tokens
          if (!authSession?.tokens?.idToken || !authSession?.tokens?.accessToken) {
            return null;
          }
          
          // Verify token hasn't expired
          const now = Math.floor(Date.now() / 1000);
          const exp = authSession.tokens.idToken.payload.exp as number;
          
          if (exp && exp < now) {
            console.warn("Token expired in getServerSession");
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
          console.error("Auth session fetch failed:", error);
          return null;
        }
      }
    });

    return session;
  } catch (error) {
    console.error("Session retrieval failed:", error);
    return null;
  }
} 