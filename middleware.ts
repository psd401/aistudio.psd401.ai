import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

// Define public routes that don't require authentication
const isPublicRoute = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/api/public/(.*)'
])

// Define protected routes that require authentication
const isProtectedRoute = createRouteMatcher([
  '/dashboard(.*)',
  '/admin(.*)',
  '/api/(.*)'  // All API routes
])

export default clerkMiddleware(async (auth, request) => {
  const { userId } = await auth()
  
  // If user is signed in and trying to access home page, redirect to dashboard
  if (userId && request.nextUrl.pathname === '/') {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  // If it's a protected route and not a public API route, ensure user is authenticated
  if (isProtectedRoute(request) && !request.url.includes('/api/public/')) {
    await auth.protect()
  }
}, {
  debug: process.env.NODE_ENV === 'development',
  signInUrl: '/sign-in',
  afterSignInUrl: '/dashboard',
  afterSignUpUrl: '/dashboard',
})

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)'
  ],
} 