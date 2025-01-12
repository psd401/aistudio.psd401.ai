'use client';

import { Group, Button, Table } from '@mantine/core';
import { User } from '@/lib/types';
import { UserRoleSelect } from './UserRoleSelect';

interface UsersTableProps {
  users: User[];
  currentUserId?: string;
  onRoleChange: (userId: number, newRole: string) => void;
  onDeleteUser: (userId: number, clerkId: string) => void;
}

export function UsersTable({ users, currentUserId, onRoleChange, onDeleteUser }: UsersTableProps) {
  return (
    <Table>
      <thead>
        <tr>
          <th>Name</th>
          <th>Email</th>
          <th>Role</th>
          <th>Last Login</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {users.map((user) => (
          <tr key={user.id}>
            <td>
              {user.firstName} {user.lastName}
            </td>
            <td>{user.email}</td>
            <td>
              <UserRoleSelect
                currentRole={user.role}
                onRoleChange={(newRole) => onRoleChange(user.id, newRole)}
                disabled={user.clerkId === currentUserId}
              />
            </td>
            <td>
              {user.lastSignInAt ? new Date(user.lastSignInAt).toLocaleString() : 'Never'}
            </td>
            <td>
              <Group>
                <Button
                  variant="outline"
                  color="red"
                  size="xs"
                  onClick={() => onDeleteUser(user.id, user.clerkId)}
                  disabled={user.clerkId === currentUserId}
                >
                  Delete
                </Button>
              </Group>
            </td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
} 