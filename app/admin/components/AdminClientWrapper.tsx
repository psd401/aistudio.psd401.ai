'use client';

import { Container, Title, Text, Stack, Tabs, Group, Button, Checkbox, Select } from '@mantine/core';
import { AiModelsClient } from '~/components/AiModelsClient';
import { UserRoleForm } from '~/components/UserRoleForm';
import type { User, AiModel } from '~/lib/schema';
import { useEffect, useState } from 'react';

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
      
      // Refresh the page to show updated roles
      window.location.reload();
    } catch (error) {
      console.error('Error updating roles:', error);
      alert('Failed to update some user roles');
    } finally {
      setIsUpdating(false);
    }
  };
  
  return (
    <Container size="xl">
      <Title>Admin Dashboard</Title>
      <Text mb="lg">Welcome back, {displayName}!</Text>
      
      <Tabs defaultValue="users">
        <Tabs.List>
          <Tabs.Tab value="users">Users</Tabs.Tab>
          <Tabs.Tab value="models">AI Models</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="users" pt="xl">
          {selectedUsers.length > 0 && (
            <Group mb="md">
              <Select
                value={bulkRole}
                onChange={setBulkRole}
                data={[
                  { value: 'student', label: 'Student' },
                  { value: 'staff', label: 'Staff' },
                  { value: 'administrator', label: 'Administrator' }
                ]}
                placeholder="Select role for selected users"
              />
              <Button 
                onClick={handleBulkUpdate}
                loading={isUpdating}
                disabled={!bulkRole}
              >
                Update Selected Users
              </Button>
              <Button 
                variant="subtle" 
                onClick={() => setSelectedUsers([])}
                disabled={isUpdating}
              >
                Clear Selection
              </Button>
            </Group>
          )}
          
          <Stack>
            {users.map(user => {
              const details = userDetails[user.clerkId];
              const userName = details ? `${details.firstName || ''} ${details.lastName || ''}`.trim() : '';
              const userEmail = details?.emailAddresses[0]?.emailAddress;
              
              return (
                <Group key={user.id} align="center">
                  <Checkbox
                    checked={selectedUsers.includes(user.clerkId)}
                    onChange={(event) => {
                      const checked = event.currentTarget.checked;
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
                </Group>
              );
            })}
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="models" pt="xl">
          <AiModelsClient initialModels={models} />
        </Tabs.Panel>
      </Tabs>
    </Container>
  );
} 