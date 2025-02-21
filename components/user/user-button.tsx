'use client';

import { UserButton as ClerkUserButton } from '@clerk/nextjs';
import { useUser } from '@clerk/nextjs';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

export function UserButton() {
  const { user } = useUser();
  const initials = user?.firstName?.[0] || user?.lastName?.[0] || '?';

  return (
    <div className="flex items-center gap-3 p-2">
      <ClerkUserButton afterSignOutUrl="/" />
      <div className="flex flex-col">
        <span className="text-sm font-medium leading-none">
          {user?.fullName}
        </span>
        <span className="text-xs text-muted-foreground">
          {user?.primaryEmailAddress?.emailAddress}
        </span>
      </div>
    </div>
  );
} 