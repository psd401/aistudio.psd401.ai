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
        <div className="flex relative">
          <NavbarNested />
          <main className="flex-1 p-6 md:p-8 lg:ml-[68px]">
            {children}
          </main>
        </div>
      ) : (
        <main className="p-6 md:p-8">
            {children}
        </main>
      )}
    </AuthWrapper>
  );
} 