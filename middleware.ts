import { auth } from "@/auth";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Public paths that don't require authentication
const PUBLIC_PATHS = [
  "/",
  "/signout",
  "/api/auth",
  "/api/public",
  "/api/health",
  "/api/ping",
  "/api/auth/federated-signout",
  "/auth/error",
];

export default auth((req) => {
  const { nextUrl, auth } = req;
  const isLoggedIn = !!auth;

  // Check if path is public
  const isPublicPath = PUBLIC_PATHS.some(path => 
    nextUrl.pathname === path || nextUrl.pathname.startsWith(path + "/")
  );

  // Allow public paths
  if (isPublicPath) {
    return NextResponse.next();
  }

  // Allow static assets
  if (
    nextUrl.pathname.startsWith("/_next") ||
    nextUrl.pathname.startsWith("/static") ||
    nextUrl.pathname.match(/\.(jpg|jpeg|png|gif|ico|css|js)$/i)
  ) {
    return NextResponse.next();
  }

  // Redirect unauthenticated users to sign-in
  if (!isLoggedIn) {
    return NextResponse.redirect(new URL(`/api/auth/signin?callbackUrl=${encodeURIComponent(nextUrl.pathname)}`, nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api/auth (NextAuth routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!api/auth|_next/static|_next/image|favicon.ico).*)",
  ],
};