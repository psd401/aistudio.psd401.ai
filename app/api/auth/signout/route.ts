import { NextRequest, NextResponse } from "next/server";
import { auth, signOut } from "@/auth";

export async function GET(request: NextRequest) {
  try {
    // Get the current session BEFORE signing out
    const session = await auth();
    
    if (session) {
      // Build the Cognito logout URL first
      const cognitoDomain = process.env.NEXT_PUBLIC_COGNITO_DOMAIN;
      const clientId = process.env.AUTH_COGNITO_CLIENT_ID;
      const logoutUri = `${request.nextUrl.origin}/`;
      
      const cognitoLogoutUrl = `https://${cognitoDomain}/logout?client_id=${clientId}&logout_uri=${encodeURIComponent(logoutUri)}`;
      
      // Sign out from NextAuth
      // IMPORTANT: Don't await this, as it might interfere with our redirect
      signOut({ redirect: false });
      
      // Immediately redirect to Cognito logout
      return NextResponse.redirect(cognitoLogoutUrl);
    }
    
    // If no session, just redirect to home
    return NextResponse.redirect(new URL("/", request.url));
  } catch (error) {
    console.error("[Sign Out Route] Error:", error);
    
    // On error, redirect home
    return NextResponse.redirect(new URL("/", request.url));
  }
}