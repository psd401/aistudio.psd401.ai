'use client';

import { useSession } from 'next-auth/react';
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

export function UserButton() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const loading = status === 'loading';

  if (loading) {
    return (
      <Button size="sm" variant="outline" disabled>
        ...
      </Button>
    );
  }

  if (!session) {
    return null;
  }

  // Extract first name from user info
  const getDisplayName = () => {
    if (session.user?.name) {
      // If we have a full name, extract the first name
      return session.user.name.split(' ')[0];
    }
    if (session.user?.email) {
      // If only email, use the part before @
      return session.user.email.split('@')[0];
    }
    return "User";
  };
  
  const displayName = getDisplayName();

  return (
    <div className="flex items-center gap-2">
      <Avatar>
        <AvatarFallback>
          {displayName.charAt(0).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <span className="text-sm font-medium">{displayName}</span>
      <Button 
        size="sm" 
        variant="outline"
        onClick={() => router.push('/signout')}
      >
        Sign out
      </Button>
    </div>
  );
} 