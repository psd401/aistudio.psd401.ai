'use client';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useState } from 'react';
import logger from '@/lib/logger';

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
        const errorText = await response.text();
        logger.error('Failed to update role', errorText);
        alert('Failed to update role');
        setRole(initialRole); // Reset to initial role on failure
      }
    } catch (error) {
      logger.error('Error updating role', error);
      alert('Failed to update role');
      setRole(initialRole); // Reset to initial role on error
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-4 flex-1">
      {userName && <div className="font-medium">{userName}</div>}
      {userEmail && <div className="text-sm text-muted-foreground">{userEmail}</div>}
      <Select
        defaultValue={role}
        onValueChange={(value) => {
          setRole(value);
          updateRole(value);
        }}
        disabled={isLoading || disabled}
      >
        <SelectTrigger data-testid="role-select" className="w-[180px]">
          <SelectValue placeholder="Select a role" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="student">Student</SelectItem>
          <SelectItem value="staff">Staff</SelectItem>
          <SelectItem value="administrator">Administrator</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
} 