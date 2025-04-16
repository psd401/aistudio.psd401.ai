import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server"

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

export default clerkMiddleware(async (auth, req) => {
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