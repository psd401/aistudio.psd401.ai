'use client';

import { useAuth } from '@clerk/nextjs';
import { NavbarNested } from '@/components/navigation/navbar-nested';

export function LayoutContent({ children }: { children: React.ReactNode }) {
  const { userId } = useAuth();

  if (!userId) {
    return children;
  }

  return (
    <div className="flex min-h-screen">
      <NavbarNested />
      <main className="flex-1 p-4">
        {children}
      </main>
    </div>
  );
} 