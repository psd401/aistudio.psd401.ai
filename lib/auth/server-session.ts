"use server"

import { auth } from "@/auth";
import logger from "@/lib/logger";

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
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return null;
    }
    
    // Convert NextAuth session to match our CognitoSession interface
    return {
      ...session.user,
      sub: session.user.id,
      email: session.user.email || undefined,
    };
  } catch (error) {
    logger.error("Session retrieval failed:", error);
    return null;
  }
}