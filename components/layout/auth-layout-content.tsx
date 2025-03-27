'use client';

import { useAuth } from '@clerk/nextjs';
import { NavbarNested } from '@/components/navigation/navbar-nested';
import { AuthWrapper } from '@/components/auth/auth-wrapper';

export default function AuthLayoutContent({ 
  children 
}: { 
  children: React.ReactNode 
}) {
  const { userId } = useAuth();

  return (
    <AuthWrapper>
      {userId ? (
        <div className="flex min-h-screen">
          <NavbarNested />
          <main className="flex-1 p-4">
            {children}
          </main>
        </div>
      ) : (
        children
      )}
    </AuthWrapper>
  );
} 