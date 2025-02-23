'use client';

import { useEffect } from 'react';
import { useAuth } from '@clerk/nextjs';

export function AuthWrapper({ children }: { children: React.ReactNode }) {
  const { userId, isLoaded } = useAuth();

  useEffect(() => {
    async function syncUser() {
      if (userId) {
        try {
          await fetch('/api/users/sync', {
            method: 'POST',
          });
        } catch (error) {
          console.error('Error syncing user:', error);
        }
      }
    }

    if (isLoaded && userId) {
      syncUser();
    }
  }, [isLoaded, userId]);

  return <>{children}</>;
} 