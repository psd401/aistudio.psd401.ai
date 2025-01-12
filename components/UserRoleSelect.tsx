'use client';

import { Select } from '@mantine/core';

interface UserRoleSelectProps {
  currentRole: string;
  onRoleChange: (newRole: string) => void;
  disabled?: boolean;
}

const ROLES = ['Admin', 'Staff', 'User'];

export function UserRoleSelect({ currentRole, onRoleChange, disabled }: UserRoleSelectProps) {
  return (
    <Select
      value={currentRole}
      onChange={(value) => value && onRoleChange(value)}
      data={ROLES}
      disabled={disabled}
      size="xs"
    />
  );
} 