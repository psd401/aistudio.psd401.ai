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

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    // Protect all non-public routes
    await auth.protect()
  }
})

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
    "/"
  ]
} 