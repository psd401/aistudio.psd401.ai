"use server"

import { createAuth } from "@/auth";
import logger from "@/lib/logger";
import { createRequestContext } from "./request-context";

export interface CognitoSession {
  sub: string;
  email?: string;
  [key: string]: unknown;
}

/**
 * Gets the current authenticated session using NextAuth v5.
 * This wraps NextAuth's auth() to maintain the same interface.
 */
export async function getServerSession(): Promise<CognitoSession | null> {
  const context = await createRequestContext();
  
  try {
    logger.debug("Creating auth instance", { requestId: context.requestId });
    
    // Create new auth instance per request
    const { auth } = createAuth();
    const session = await auth();
    
    if (!session?.user?.id) {
      logger.debug("No session found", { requestId: context.requestId });
      return null;
    }
    
    // Validate session integrity
    if (session.user.id && session.user.email) {
      logger.debug("Session validated", { 
        requestId: context.requestId,
        userId: session.user.id,
        // Never log full session data
      });
    }
    
    // Convert NextAuth session to match our CognitoSession interface
    return {
      ...session.user,
      sub: session.user.id,
      email: session.user.email || undefined,
    };
  } catch (error) {
    logger.error("Session retrieval failed:", { 
      error, 
      requestId: context.requestId 
    });
    return null;
  }
}