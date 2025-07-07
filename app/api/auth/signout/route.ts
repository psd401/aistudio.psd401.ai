import { NextRequest, NextResponse } from "next/server";
import { getCookieClearingHeaders } from "@/lib/auth/cookie-utils";

export async function POST(request: NextRequest) {
  try {
    // Create response that redirects to home
    const response = NextResponse.json(
      { success: true, message: "Signed out successfully" },
      { status: 200 }
    );

    // Clear all authentication cookies server-side
    getCookieClearingHeaders().forEach(header => {
      response.headers.append("Set-Cookie", header);
    });

    // Add cache control headers to prevent caching
    response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    response.headers.set("Pragma", "no-cache");
    response.headers.set("Expires", "0");

    return response;
  } catch (error) {
    console.error("[Sign Out Route] Error:", error);
    
    // Even on error, try to clear cookies
    const response = NextResponse.json(
      { success: false, message: "Sign out error occurred" },
      { status: 500 }
    );
    
    getCookieClearingHeaders().forEach(header => {
      response.headers.append("Set-Cookie", header);
    });
    
    return response;
  }
}

export async function GET(request: NextRequest) {
  // Also support GET for direct navigation
  const response = NextResponse.redirect(new URL("/", request.url));
  
  // Clear all authentication cookies
  getCookieClearingHeaders().forEach(header => {
    response.headers.append("Set-Cookie", header);
  });
  
  return response;
}