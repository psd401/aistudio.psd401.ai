'use client';

import { Select, Group, Text } from '@mantine/core';
import { useState } from 'react';

interface UserRoleFormProps {
  userId: string;
  initialRole: string;
  userName?: string;
  userEmail?: string;
  disabled?: boolean;
}

export function UserRoleForm({ userId, initialRole, userName, userEmail, disabled }: UserRoleFormProps) {
  const [role, setRole] = useState(initialRole);
  const [isLoading, setIsLoading] = useState(false);

  async function updateRole(newRole: string) {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/admin/users/${userId}/role`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole })
      });

      if (!response.ok) {
        console.error('Failed to update role:', await response.text());
        alert('Failed to update role');
        setRole(initialRole); // Reset to initial role on failure
      }
    } catch (error) {
      console.error('Error updating role:', error);
      alert('Failed to update role');
      setRole(initialRole); // Reset to initial role on error
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Group align="center" gap="md" style={{ flex: 1 }}>
      {userName && <Text fw={500}>{userName}</Text>}
      {userEmail && <Text size="sm" c="dimmed">{userEmail}</Text>}
      <Select
        data-testid="role-select"
        name="role"
        value={role}
        onChange={(value) => {
          if (value) {
            setRole(value);
            updateRole(value);
          }
        }}
        data={[
          { value: 'student', label: 'Student' },
          { value: 'staff', label: 'Staff' },
          { value: 'administrator', label: 'Administrator' }
        ]}
        disabled={isLoading || disabled}
      />
    </Group>
  );
} 