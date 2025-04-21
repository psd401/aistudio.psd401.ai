import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"

// Create route matchers for protected routes
const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/public(.*)",
  "/api/users/sync",
  "/api/webhooks(.*)"
])

// Corrected list of protected routes
const isProtectedRoute = createRouteMatcher([
  "/dashboard(.*)", 
  "/admin(.*)",
  "/utilities/assistant-architect(.*)" 
])

// Add matcher for long-running operations
const isLongRunningRoute = createRouteMatcher([
  "/tools/assistant-architect/(.*)"
])

export default clerkMiddleware(async (auth, req) => {
  // Set longer timeout headers for long-running routes
  if (isLongRunningRoute(req)) {
    const response = NextResponse.next()
    response.headers.set('Connection', 'keep-alive')
    response.headers.set('Keep-Alive', 'timeout=300')
    return response
  }

  if (isProtectedRoute(req) || !isPublicRoute(req)) {
    // Protect all non-public routes and explicitly protected routes
    await auth.protect()
  }
})

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
    "/"
  ]
} 