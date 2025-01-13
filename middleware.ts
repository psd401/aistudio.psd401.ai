import { clerkMiddleware } from '@clerk/nextjs/server';

export default clerkMiddleware({
  debug: false,
  publicRoutes: [
    '/',
    '/sign-in(.*)',
    '/sign-up(.*)',
    '/api/public/:path*'
  ],
  protectedRoutes: [
    '/dashboard(.*)',
    '/admin(.*)',
    '/api/auth/:path*',
    '/api/users/:path*',
    // Add ideas routes
    '/ideas(.*)',
    '/api/ideas(.*)'
  ]
});

export const config = {
  matcher: ['/((?!.+\\.[\\w]+$|_next).*)', '/', '/(api|trpc)(.*)'],
}; 