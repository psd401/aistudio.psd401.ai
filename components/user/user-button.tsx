'use client';

import { UserButton as ClerkUserButton, useAuth } from '@clerk/nextjs';
import { useUser } from '@clerk/nextjs';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

export function UserButton() {
  const { isLoaded, userId } = useAuth();

  if (!isLoaded || !userId) {
    // You can return a loading state or null
    return null;
  }

  // Render the Clerk UserButton when the user is loaded
  return <ClerkUserButton afterSignOutUrl="/" />;
} 