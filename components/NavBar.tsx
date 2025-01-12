'use client';

import { UserButton } from '@clerk/nextjs';
import { Group, Text } from '@mantine/core';
import Link from 'next/link';

export function NavBar() {
  return (
    <header className="h-[60px] border-b">
      <Group h="100%" px="md" justify="space-between">
        <Group>
          <Text component={Link} href="/" fw={700}>
            Enterprise App
          </Text>
          <Text component={Link} href="/dashboard">
            Dashboard
          </Text>
          <Text component={Link} href="/admin">
            Admin
          </Text>
        </Group>
        <UserButton afterSignOutUrl="/" />
      </Group>
    </header>
  );
} 