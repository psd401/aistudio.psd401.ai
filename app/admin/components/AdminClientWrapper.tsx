'use client';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AiModelsClient } from '@/components/features/ai-models-client';
import { UserRoleForm } from '@/components/user/user-role-form';
import type { User, AiModel } from '~/lib/schema';
import { useEffect, useState } from 'react';
import { useToast } from '@/components/ui/use-toast';

interface AdminClientWrapperProps {
  currentUser: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email?: string;
  };
  users: User[];
  models: AiModel[];
}

interface ClerkUser {
  firstName: string | null;
  lastName: string | null;
  emailAddresses: { emailAddress: string }[];
}

export function AdminClientWrapper({ currentUser, users, models }: AdminClientWrapperProps) {
  const displayName = currentUser.firstName || currentUser.email || currentUser.id;
  const [userDetails, setUserDetails] = useState<Record<string, ClerkUser>>({});
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [bulkRole, setBulkRole] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const { toast } = useToast();
  
  useEffect(() => {
    // Fetch user details from Clerk for each user
    const fetchUserDetails = async () => {
      const details: Record<string, ClerkUser> = {};
      for (const user of users) {
        try {
          const response = await fetch(`/api/admin/users/${user.clerkId}/details`);
          if (response.ok) {
            details[user.clerkId] = await response.json();
          }
        } catch (error) {
          console.error('Error fetching user details:', error);
        }
      }
      setUserDetails(details);
    };
    
    fetchUserDetails();
  }, [users]);

  const handleBulkUpdate = async () => {
    if (!bulkRole || selectedUsers.length === 0) return;
    
    setIsUpdating(true);
    try {
      await Promise.all(selectedUsers.map(userId =>
        fetch(`/api/admin/users/${userId}/role`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role: bulkRole })
        })
      ));
      
      // Reset selection after successful update
      setSelectedUsers([]);
      setBulkRole(null);
      
      toast({
        title: 'Success',
        description: 'User roles updated successfully',
        variant: 'default',
      });
      
      // Refresh the page to show updated roles
      window.location.reload();
    } catch (error) {
      console.error('Error updating roles:', error);
      toast({
        title: 'Error',
        description: 'Failed to update some user roles',
        variant: 'destructive',
      });
    } finally {
      setIsUpdating(false);
    }
  };
  
  return (
    <div className="container">
      <h1 className="text-3xl font-bold">Admin Dashboard</h1>
      <p className="text-muted-foreground mb-8">Welcome back, {displayName}!</p>
      
      <Tabs defaultValue="users" className="space-y-6">
        <TabsList>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="models">AI Models</TabsTrigger>
        </TabsList>

        <TabsContent value="users">
          {selectedUsers.length > 0 && (
            <div className="flex items-center gap-4 mb-6">
              <Select
                value={bulkRole || ''}
                onValueChange={setBulkRole}
              >
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Select role for users" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="student">Student</SelectItem>
                  <SelectItem value="staff">Staff</SelectItem>
                  <SelectItem value="administrator">Administrator</SelectItem>
                </SelectContent>
              </Select>
              <Button 
                onClick={handleBulkUpdate}
                disabled={!bulkRole || isUpdating}
              >
                Update Selected Users
              </Button>
              <Button 
                variant="outline" 
                onClick={() => setSelectedUsers([])}
                disabled={isUpdating}
              >
                Clear Selection
              </Button>
            </div>
          )}
          
          <div className="space-y-4">
            {users.map(user => {
              const details = userDetails[user.clerkId];
              const userName = details ? `${details.firstName || ''} ${details.lastName || ''}`.trim() : '';
              const userEmail = details?.emailAddresses[0]?.emailAddress;
              
              return (
                <div key={user.id} className="flex items-center gap-4">
                  <Checkbox
                    id={`user-${user.id}`}
                    checked={selectedUsers.includes(user.clerkId)}
                    onCheckedChange={(checked) => {
                      setSelectedUsers(old => 
                        checked
                          ? [...old, user.clerkId]
                          : old.filter(id => id !== user.clerkId)
                      );
                    }}
                    disabled={isUpdating}
                  />
                  <UserRoleForm 
                    userId={user.clerkId} 
                    initialRole={user.role} 
                    userName={userName || undefined}
                    userEmail={userEmail}
                    disabled={isUpdating || selectedUsers.length > 0}
                  />
                </div>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="models">
          <AiModelsClient initialModels={models} />
        </TabsContent>
      </Tabs>
    </div>
  );
} 