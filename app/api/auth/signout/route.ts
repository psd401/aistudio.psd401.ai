import { NextRequest, NextResponse } from "next/server";
import { createAuth } from "@/auth";
import { createLogger, generateRequestId, startTimer } from "@/lib/logger";
import { buildCognitoLogoutUrl } from "@/lib/auth/cognito-utils";

export async function GET(request: NextRequest) {
  const requestId = generateRequestId();
  const timer = startTimer("api.auth.signout");
  const log = createLogger({ requestId, route: "api.auth.signout" });
  
  log.info("GET /api/auth/signout - User sign out requested");
  
  try {
    // Create auth instance for this request
    const { auth, signOut } = createAuth();
    
    // Get the current session BEFORE signing out
    const session = await auth();
    
    if (session) {
      log.debug("Session found, proceeding with sign out", { sessionId: (session as unknown as Record<string, unknown>)?.sub || "unknown" });
      
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
      log.info("User signed out successfully, redirecting to Cognito");
      timer({ status: "success" });
      return NextResponse.redirect(cognitoLogoutUrl);
    }
    
    // If no session, just redirect to home
    log.debug("No session found, redirecting to home");
    timer({ status: "success", note: "no_session" });
    return NextResponse.redirect(new URL("/", request.url));
  } catch (error) {
    timer({ status: "error" });
    log.error("[Sign Out Route] Error:", error);
    
    // On error, redirect home
    return NextResponse.redirect(new URL("/", request.url));
  }
}