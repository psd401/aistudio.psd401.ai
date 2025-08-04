import { NextRequest, NextResponse } from "next/server";
import { createAuth } from "@/auth";
import logger from "@/lib/logger";
import { buildCognitoLogoutUrl } from "@/lib/auth/cognito-utils";

export async function GET(request: NextRequest) {
  try {
    // Create auth instance for this request
    const { auth, signOut } = createAuth();
    
    // Get the current session BEFORE signing out
    const session = await auth();
    
    if (session) {
      // Build the Cognito logout URL first
      const cognitoLogoutUrl = buildCognitoLogoutUrl(request.nextUrl.origin);
      
      // Sign out from NextAuth
      // IMPORTANT: We intentionally don't await this call for the following reasons:
      // 1. The NextAuth signOut clears the session cookie synchronously
      // 2. Awaiting could introduce a race condition with the Cognito redirect
      // 3. The user needs to be redirected to Cognito immediately to complete logout
      // 4. Any async cleanup operations in signOut are non-critical for logout flow
      signOut({ redirect: false });
      
      // Immediately redirect to Cognito logout
      return NextResponse.redirect(cognitoLogoutUrl);
    }
    
    // If no session, just redirect to home
    return NextResponse.redirect(new URL("/", request.url));
  } catch (error) {
    logger.error("[Sign Out Route] Error:", error);
    
    // On error, redirect home
    return NextResponse.redirect(new URL("/", request.url));
  }
}