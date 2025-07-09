"use client"

import { useEffect } from 'react';

export default function SignOutPage() {
  useEffect(() => {
    // Simply redirect to the server-side federated signout
    // This avoids client-side signOut issues
    window.location.href = '/api/auth/federated-signout';
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <p className="text-lg text-muted-foreground">Signing out...</p>
      </div>
    </div>
  );
}