import { NextResponse, NextRequest } from "next/server";
import { getServerSession } from "@/lib/auth/server-session";

const PUBLIC_PATHS: string[] = [
  "/", // landing page
  "/sign-in",
  "/favicon.ico",
  "/api/auth/callback", // Cognito callback
  "/api/public", // expand as needed
];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Static assets and Next.js internals should always pass through
  if (pathname.startsWith("/_next") || pathname.startsWith("/static")) {
    return NextResponse.next();
  }

  if (isPublic(pathname)) {
    return NextResponse.next();
  }

  const session = await getServerSession();
  if (!session) {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  // Example: attach decoded JWT to request headers for downstream usage if needed
  const res = NextResponse.next();
  res.headers.set("x-user-sub", session.sub);
  return res;
}

export const config = {
  matcher: "/((?!_next/static|_next/image|favicon.ico).*)",
}; 