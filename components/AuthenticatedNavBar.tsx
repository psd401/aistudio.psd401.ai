'use client';

import { useAuth } from '@clerk/nextjs';
import { NavBar } from './NavBar';

export function AuthenticatedNavBar() {
  const { isSignedIn } = useAuth();

  if (!isSignedIn) {
    return null;
  }

  return <NavBar />;
} 