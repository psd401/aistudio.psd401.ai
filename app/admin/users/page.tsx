'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import { UsersTable } from '@/components/user/users-table';
import { User } from '@/lib/types';
import { useToast } from '@/components/ui/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [userToDelete, setUserToDelete] = useState<{ id: number; clerkId: string } | null>(null);
  const { userId } = useAuth();
  const { toast } = useToast();

  const fetchUsers = async () => {
    try {
      const response = await fetch('/api/admin/users');
      
      // Handle status codes
      if (response.status === 401) {
        throw new Error('Unauthorized - Please log in');
      } else if (response.status === 403) {
        throw new Error('Forbidden - Admin access required');
      } else if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }
      
      const result = await response.json();
      console.log('API response:', result);
      
      if (!result.isSuccess) {
        throw new Error(result.message || 'Failed to fetch users');
      }
      
      setUsers(result.data || []);
    } catch (error) {
      console.error('Error fetching users:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to load users',
        variant: 'destructive',
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

      toast({
        title: 'Success',
        description: 'User role updated successfully',
        variant: 'default',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update user role',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteUser = async (userId: number, clerkId: string) => {
    setUserToDelete({ id: userId, clerkId });
    setShowDeleteDialog(true);
  };

  const confirmDelete = async () => {
    if (!userToDelete) return;

    try {
      const response = await fetch(`/api/admin/users/${userToDelete.id}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) throw new Error('Failed to delete user');
      
      setUsers(users.filter(user => user.id !== userToDelete.id));
      toast({
        title: 'Success',
        description: 'User deleted successfully',
        variant: 'default',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete user',
        variant: 'destructive',
      });
    } finally {
      setShowDeleteDialog(false);
      setUserToDelete(null);
    }
  };

  if (loading) {
    return (
      <div className="flex h-[200px] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="p-6">
      <UsersTable
        users={users}
        currentUserId={userId}
        onRoleChange={handleRoleChange}
        onDeleteUser={handleDeleteUser}
      />

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete User</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this user? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
} 