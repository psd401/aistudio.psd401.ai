'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { IconPlus, IconEdit, IconTrash } from '@tabler/icons-react';
import { User } from '@/lib/types';
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
  Column,
} from '@tanstack/react-table';
import { IconChevronDown, IconChevronUp, IconSelector } from '@tabler/icons-react';

interface UserFormProps {
  userData: UserFormData;
  setUserData: (data: UserFormData) => void;
  onSubmit: () => void;
  onCancel: () => void;
  isEditing: boolean;
}

const UserForm = React.memo(function UserForm({ 
  userData, 
  setUserData, 
  onSubmit, 
  onCancel, 
  isEditing 
}: UserFormProps) {
  
  const handleFirstNameChange = (e: React.ChangeEvent<HTMLInputElement>) => 
    setUserData({ ...userData, firstName: e.target.value });
    
  const handleLastNameChange = (e: React.ChangeEvent<HTMLInputElement>) => 
    setUserData({ ...userData, lastName: e.target.value });
    
  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => 
    setUserData({ ...userData, email: e.target.value });
    
  const handleRoleChange = (value: string) => 
    setUserData({ ...userData, role: value });
    
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">First Name</label>
          <Input
            value={userData.firstName}
            onChange={handleFirstNameChange}
            required
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Last Name</label>
          <Input
            value={userData.lastName}
            onChange={handleLastNameChange}
            required
          />
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Email</label>
        <Input
          type="email"
          value={userData.email}
          onChange={handleEmailChange}
          required
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Role</label>
        <Select
          value={userData.role}
          onValueChange={handleRoleChange}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select a role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="student">Student</SelectItem>
            <SelectItem value="staff">Staff</SelectItem>
            <SelectItem value="administrator">Administrator</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex space-x-2 pt-4">
        <Button onClick={onSubmit}>{isEditing ? 'Update' : 'Add'} User</Button>
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
});

interface UsersTableProps {
  users: User[];
  currentUserId?: string;
  onAddUser?: (user: Omit<User, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  onUpdateUser?: (userId: number | string, updates: Partial<User>) => Promise<void>;
  onDeleteUser: (userId: number | string) => void;
  onRoleChange: (userId: number | string, newRole: string) => void;
}

type UserFormData = {
  firstName: string;
  lastName: string;
  email: string;
  role: string;
};

const emptyUser: UserFormData = {
  firstName: '',
  lastName: '',
  email: '',
  role: 'student',
};

export function UsersTable({ 
  users, 
  currentUserId,
  onAddUser,
  onUpdateUser,
  onDeleteUser,
  onRoleChange
}: UsersTableProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [userFormData, setUserFormData] = useState<UserFormData>(emptyUser);
  const [sorting, setSorting] = useState<SortingState>([]);
  
  // Memoized column header component to prevent recreation on each render
  const SortableColumnHeader = useCallback(({
    column,
    title,
    className = ""
  }: {
    column: Column<User, unknown>;
    title: string;
    className?: string;
  }) => (
    <Button
      variant="ghost"
      onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      className={`hover:bg-transparent px-0 ${className}`}
    >
      {title}
      {column.getIsSorted() === "asc" ? (
        <IconChevronUp className="ml-2 h-4 w-4" />
      ) : column.getIsSorted() === "desc" ? (
        <IconChevronDown className="ml-2 h-4 w-4" />
      ) : (
        <IconSelector className="ml-2 h-4 w-4" />
      )}
    </Button>
  ), []);

  // Event handler for edit button
  const handleEditClick = useCallback((user: User) => {
    setEditingUser(user);
    setUserFormData({
      firstName: user.firstName || '',
      lastName: user.lastName || '',
      email: user.email,
      role: user.role || 'student',
    });
  }, []);

  // Event handler for delete button
  const handleDeleteClick = useCallback((userId: number | string) => {
    onDeleteUser(userId);
  }, [onDeleteUser]);

  const columns = useMemo<ColumnDef<User>[]>(
    () => [
      {
        accessorKey: 'name',
        header: ({ column }) => <SortableColumnHeader column={column} title="Name" />,
        cell: ({ row }) => {
          const firstName = row.original.firstName || '';
          const lastName = row.original.lastName || '';
          return `${firstName} ${lastName}`.trim() || '(No name)';
        },
      },
      {
        accessorKey: 'email',
        header: ({ column }) => <SortableColumnHeader column={column} title="Email" />,
      },
      {
        accessorKey: 'role',
        header: ({ column }) => <SortableColumnHeader column={column} title="Role" />,
        cell: ({ row }) => (
          <Select
            value={row.original.role || ''}
            onValueChange={(newRole) => onRoleChange(row.original.id, newRole)}
            disabled={currentUserId ? row.original.id === currentUserId : false}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="student">Student</SelectItem>
              <SelectItem value="staff">Staff</SelectItem>
              <SelectItem value="administrator">Administrator</SelectItem>
            </SelectContent>
          </Select>
        ),
      },
      {
        accessorKey: 'lastSignInAt',
        header: ({ column }) => <SortableColumnHeader column={column} title="Last Login" />,
        cell: ({ row }) => {
          const value = row.getValue('lastSignInAt') as string;
          return value ? new Date(value).toLocaleString() : 'Never';
        },
      },
      {
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => (
          <div className="flex justify-center space-x-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleEditClick(row.original)}
              className="text-blue-500 hover:text-blue-600"
            >
              <IconEdit size={16} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleDeleteClick(row.original.id)}
              disabled={currentUserId ? row.original.id === currentUserId : false}
              className="text-destructive hover:text-destructive/90"
            >
              <IconTrash size={16} />
            </Button>
          </div>
        ),
      },
    ],
    [SortableColumnHeader, handleEditClick, handleDeleteClick, onRoleChange, currentUserId]
  );

  const table = useReactTable({
    data: users || [],
    columns,
    state: {
      sorting,
    },
    enableMultiSort: true,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const handleSubmit = useCallback(() => {
    if (editingUser) {
      if (onUpdateUser) {
        onUpdateUser(editingUser.id, userFormData);
      } else if (onRoleChange && userFormData.role !== editingUser.role) {
        onRoleChange(editingUser.id, userFormData.role);
      }
      setEditingUser(null);
    } else if (onAddUser) {
      onAddUser(userFormData);
      setShowAddForm(false);
    }
    setUserFormData(emptyUser);
  }, [editingUser, userFormData, onUpdateUser, onAddUser, onRoleChange]);

  const handleCancel = useCallback(() => {
    setShowAddForm(false);
    setEditingUser(null);
    setUserFormData(emptyUser);
  }, []);

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSorting([])}
            className="text-xs"
            disabled={sorting.length === 0}
          >
            Reset Sort
          </Button>
          {sorting.length > 0 && (
            <span className="text-sm text-muted-foreground">
              Hold Shift to sort by multiple columns
            </span>
          )}
        </div>
        {onAddUser && (
          <Button
            onClick={() => setShowAddForm(true)}
            className="flex items-center space-x-2"
          >
            <IconPlus size={16} />
            <span>Add User</span>
          </Button>
        )}
      </div>

      <Dialog open={showAddForm || editingUser !== null} onOpenChange={(open) => !open && handleCancel()}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>{editingUser ? 'Edit User' : 'Add New User'}</DialogTitle>
          </DialogHeader>
          <UserForm
            userData={userFormData}
            setUserData={setUserFormData}
            onSubmit={handleSubmit}
            onCancel={handleCancel}
            isEditing={!!editingUser}
          />
        </DialogContent>
      </Dialog>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="bg-muted hover:bg-muted">
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} className="h-10">
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row, index) => (
                <TableRow 
                  key={row.id}
                  className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  No users found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
} 