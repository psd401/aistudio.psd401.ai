'use client';
import { useEffect } from 'react';
import { signInWithRedirect } from 'aws-amplify/auth';

export default function SignInPage() {
  useEffect(() => {
    signInWithRedirect();
  }, []);
  return <div>Redirecting to sign in...</div>;
} 