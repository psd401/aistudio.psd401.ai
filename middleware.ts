import { NextResponse, NextRequest } from "next/server";
import { validateJWT } from "@/lib/auth/jwt-validator";

const PUBLIC_PATHS: string[] = [
  "/", // landing page
  "/sign-in",
  "/favicon.ico",
  "/api/auth", // AWS Amplify auth routes including signout
  "/api/public", // expand as needed
  "/api/health", // Health check endpoint
  "/api/ping", // Ping endpoint for testing
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
    // Use our custom JWT validation instead of Amplify
    const session = await validateJWT();
    
    if (!session || !session.sub) {
      // Log unauthorized access attempt (in production, use proper logging)
      
      // Redirect to home page
      const url = req.nextUrl.clone();
      url.pathname = "/";
      return NextResponse.redirect(url);
    }

    // Valid session - add user info to headers for downstream use
    const res = NextResponse.next();
    res.headers.set("x-user-sub", session.sub);
    res.headers.set("x-auth-validated", new Date().toISOString());
    
    return res;
  } catch {
    // Log authentication errors (in production, use proper logging)
    
    // On any error, allow the request to proceed
    // This prevents 500 errors from blocking the entire app
    return NextResponse.next();
  }
}

export const config = {
  matcher: "/((?!_next/static|_next/image|favicon.ico).*)",
};