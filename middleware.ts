import { NextResponse, NextRequest } from "next/server";
import { getServerSession } from "@/lib/auth/server-session";
import { getCookieClearingHeaders } from "@/lib/auth/cookie-utils";

const PUBLIC_PATHS: string[] = [
  "/", // landing page
  "/sign-in",
  "/favicon.ico",
  "/api/auth", // AWS Amplify auth routes including signout
  "/api/public", // expand as needed
  "/hero-bg.jpg", // public assets
];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Static assets and Next.js internals should always pass through
  if (
    pathname.startsWith("/_next") || 
    pathname.startsWith("/static") ||
    pathname.match(/\.(jpg|jpeg|png|gif|ico|css|js)$/i)
  ) {
    return NextResponse.next();
  }

  // Public paths bypass authentication
  if (isPublic(pathname)) {
    return NextResponse.next();
  }

  try {
    // Check authentication with proper error handling
    const session = await getServerSession();
    
    if (!session || !session.sub) {
      console.warn(`[Middleware] Unauthorized access attempt to: ${pathname}`);
      
      // Clear any stale auth cookies and redirect
      const url = req.nextUrl.clone();
      url.pathname = "/";
      const response = NextResponse.redirect(url);
      
      // Add cookie clearing headers
      getCookieClearingHeaders().forEach(header => {
        response.headers.append("Set-Cookie", header);
      });
      
      return response;
    }

    // Valid session - add user info to headers for downstream use
    const res = NextResponse.next();
    res.headers.set("x-user-sub", session.sub);
    
    // Optional: Add session validation timestamp
    res.headers.set("x-auth-validated", new Date().toISOString());
    
    return res;
  } catch (error) {
    console.error(`[Middleware] Authentication error for ${pathname}:`, error);
    
    // On any error, redirect to home and clear cookies
    const url = req.nextUrl.clone();
    url.pathname = "/";
    const response = NextResponse.redirect(url);
    
    // Clear cookies on error
    getCookieClearingHeaders().forEach(header => {
      response.headers.append("Set-Cookie", header);
    });
    
    return response;
  }
}

export const config = {
  matcher: "/((?!_next/static|_next/image|favicon.ico).*)",
}; 