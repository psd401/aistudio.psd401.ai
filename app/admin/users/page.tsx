'use client';

import { useEffect, useState } from 'react';
import { Text, LoadingOverlay } from '@mantine/core';
import { useAuth } from '@clerk/nextjs';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { UsersTable } from '@/components/UsersTable';
import { User } from '@/lib/types';

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const { userId } = useAuth();

  const fetchUsers = async () => {
    try {
      const response = await fetch('/api/admin/users');
      if (!response.ok) throw new Error('Failed to fetch users');
      const data = await response.json();
      setUsers(data);
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Failed to load users',
        color: 'red',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleRoleChange = async (userId: number, newRole: string) => {
    try {
      const response = await fetch(`/api/admin/users/${userId}/role`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });
      
      if (!response.ok) throw new Error('Failed to update role');
      
      setUsers(users.map(user => 
        user.id === userId ? { ...user, role: newRole } : user
      ));

      notifications.show({
        title: 'Success',
        message: 'User role updated successfully',
        color: 'green',
      });
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Failed to update user role',
        color: 'red',
      });
    }
  };

  const handleDeleteUser = async (userId: number, clerkId: string) => {
    modals.openConfirmModal({
      title: 'Delete User',
      children: (
        <Text size="sm">
          Are you sure you want to delete this user? This action cannot be undone.
        </Text>
      ),
      labels: { confirm: 'Delete', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        try {
          const response = await fetch(`/api/admin/users/${userId}`, {
            method: 'DELETE',
          });
          
          if (!response.ok) throw new Error('Failed to delete user');
          
          setUsers(users.filter(user => user.id !== userId));
          notifications.show({
            title: 'Success',
            message: 'User deleted successfully',
            color: 'green',
          });
        } catch (error) {
          notifications.show({
            title: 'Error',
            message: 'Failed to delete user',
            color: 'red',
          });
        }
      },
    });
  };

  return (
    <div style={{ position: 'relative', padding: '20px' }}>
      <LoadingOverlay visible={loading} />
      <UsersTable
        users={users}
        currentUserId={userId}
        onRoleChange={handleRoleChange}
        onDeleteUser={handleDeleteUser}
      />
    </div>
  );
} 