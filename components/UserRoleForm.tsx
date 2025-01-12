'use client';

import { Select } from '@mantine/core';
import { useState } from 'react';

interface UserRoleFormProps {
  userId: string;
  initialRole: string;
}

export function UserRoleForm({ userId, initialRole }: UserRoleFormProps) {
  const [role, setRole] = useState(initialRole);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    
    const response = await fetch(`/api/users/${userId}/role`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role })
    });

    if (!response.ok) {
      alert('Failed to update role');
    }
  }

  return (
    <form onSubmit={handleSubmit} data-testid="role-form">
      <Select
        data-testid="role-select"
        name="role"
        value={role}
        onChange={(value) => setRole(value || initialRole)}
        data={[
          { value: 'Staff', label: 'Staff' },
          { value: 'Admin', label: 'Admin' }
        ]}
      />
    </form>
  );
} 