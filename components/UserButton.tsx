'use client';

import { UnstyledButton, Group, Avatar, Text, rem } from '@mantine/core';
import { IconChevronRight } from '@tabler/icons-react';
import { UserButton as ClerkUserButton } from '@clerk/nextjs';
import { useUser } from '@clerk/nextjs';
import classes from './UserButton.module.css';

export function UserButton() {
  const { user } = useUser();

  return (
    <div className={classes.userWrapper}>
      <ClerkUserButton afterSignOutUrl="/" />
      <div className={classes.userInfo}>
        <Text size="sm" fw={500}>
          {user?.fullName}
        </Text>
        <Text c="dimmed" size="xs">
          {user?.primaryEmailAddress?.emailAddress}
        </Text>
      </div>
    </div>
  );
} 