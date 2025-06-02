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
  // Create response
  const response = NextResponse.next()

  // Add security headers to all responses
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('X-XSS-Protection', '1; mode=block')
  
  // Content Security Policy
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://clerk.com https://*.clerk.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: https: blob:",
    "connect-src 'self' https://*.clerk.com https://*.supabase.co wss://*.clerk.com",
    "frame-src 'self' https://*.clerk.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'"
  ].join('; ')
  
  response.headers.set('Content-Security-Policy', csp)

  // Set longer timeout headers for long-running routes
  if (isLongRunningRoute(req)) {
    response.headers.set('Connection', 'keep-alive')
    response.headers.set('Keep-Alive', 'timeout=300')
  }

  if (isProtectedRoute(req) || !isPublicRoute(req)) {
    // Protect all non-public routes and explicitly protected routes
    await auth.protect()
  }
  
  return response
})

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
    "/"
  ]
} 