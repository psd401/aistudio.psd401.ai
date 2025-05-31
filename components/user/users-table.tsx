'use client';

import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { User } from '@/lib/types';
import { UserRoleSelect } from './user-role-select';

interface UsersTableProps {
  users: User[];
  currentUserId?: string;
  onRoleChange: (userId: number, newRole: string) => void;
  onDeleteUser: (userId: number, clerkId: string) => void;
}

export function UsersTable({ users, currentUserId, onRoleChange, onDeleteUser }: UsersTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Email</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Last Login</TableHead>
          <TableHead>Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {users && users.length > 0 ? (
          users.map((user) => (
            <TableRow key={user.id}>
              <TableCell>
                {user.firstName || ''} {user.lastName || ''}
              </TableCell>
              <TableCell>{user.email || ''}</TableCell>
              <TableCell>
                <UserRoleSelect
                  currentRole={user.role || ''}
                  onRoleChange={(newRole) => onRoleChange(user.id, newRole)}
                  disabled={user.clerkId === currentUserId}
                />
              </TableCell>
              <TableCell>
                {user.lastSignInAt ? new Date(user.lastSignInAt).toLocaleString() : 'Never'}
              </TableCell>
              <TableCell>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onDeleteUser(user.id, user.clerkId)}
                  disabled={user.clerkId === currentUserId}
                  className="text-destructive hover:text-destructive"
                >
                  Delete
                </Button>
              </TableCell>
            </TableRow>
          ))
        ) : (
          <TableRow>
            <TableCell colSpan={5} className="text-center py-4">
              No users found
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
} 