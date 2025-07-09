'use client';

import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle } from 'lucide-react';
import Link from 'next/link';
import { Suspense } from 'react';

function AuthErrorContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get('error');
  
  // Check if this is a nonce/callback error (session mismatch)
  const isSessionError = error === 'CallbackRouteError' || 
                        error?.toLowerCase().includes('nonce') || 
                        error?.toLowerCase().includes('callback');
  
  const handleClearSession = () => {
    // Redirect to home page to clear session
    window.location.href = '/';
  };
  
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-600">
            <AlertCircle className="h-5 w-5" />
            Authentication Error
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">
            {error === 'Configuration' && 'There is a problem with the server configuration.'}
            {error === 'AccessDenied' && 'You do not have permission to sign in.'}
            {error === 'Verification' && 'The verification token has expired or has already been used.'}
            {error === 'CallbackRouteError' && 'There was an issue with the authentication callback. This often happens when you have an existing session.'}
            {(!error || !['Configuration', 'AccessDenied', 'Verification', 'CallbackRouteError'].includes(error)) && 
              'An error occurred during authentication.'}
          </p>
          
          {isSessionError && (
            <div className="bg-amber-50 border border-amber-200 p-3 rounded text-sm">
              <p className="text-amber-800">
                This error often occurs when you have an active Cognito session that conflicts with the sign-in process. 
                Try clearing your session and signing in again.
              </p>
            </div>
          )}
          
          <div className="space-y-2">
            {isSessionError && (
              <Button 
                onClick={handleClearSession}
                className="w-full"
                variant="destructive"
              >
                Clear Session & Try Again
              </Button>
            )}
            <Link href="/" className="block">
              <Button 
                variant={isSessionError ? "outline" : "default"}
                className="w-full"
              >
                Return to Home
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function AuthError() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <Card className="w-full max-w-md">
          <CardContent className="p-6">
            <p className="text-center text-muted-foreground">Loading...</p>
          </CardContent>
        </Card>
      </div>
    }>
      <AuthErrorContent />
    </Suspense>
  );
}