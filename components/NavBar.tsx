'use client';

import { UserButton, useUser } from '@clerk/nextjs';
import { Group, Text } from '@mantine/core';
import Link from 'next/link';
import { useEffect, useState } from 'react';

export function NavBar() {
  const { isLoaded, user } = useUser();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    // Only check role if user is loaded and signed in
    if (isLoaded && user) {
      checkAdminRole();
    }
  }, [isLoaded, user]);

  async function checkAdminRole() {
    try {
      const response = await fetch('/api/auth/check-role?role=administrator');
      if (response.ok) {
        const { hasRole } = await response.json();
        console.log('Admin role check result:', hasRole);
        setIsAdmin(hasRole);
      } else if (response.status !== 401) {
        // Don't log 401s as they're expected when not signed in
        console.error('Error checking admin role:', await response.text());
      }
    } catch (error) {
      console.error('Error checking admin role:', error);
    }
  }

  return (
    <header className="h-[60px] border-b">
      <Group h="100%" px="md" justify="space-between">
        <Group>
          <Text component={Link} href="/dashboard" fw={700}>
            Enterprise App
          </Text>
          {isAdmin && (
            <Text component={Link} href="/admin" c="blue">
              Admin
            </Text>
          )}
        </Group>
        <UserButton afterSignOutUrl="/" />
      </Group>
    </header>
  );
} 