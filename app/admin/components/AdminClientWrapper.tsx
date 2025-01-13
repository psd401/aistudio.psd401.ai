'use client';

import { Container, Title, Text, Stack, Tabs } from '@mantine/core';
import { AiModelsClient } from '~/components/AiModelsClient';
import { UserRoleForm } from '~/components/UserRoleForm';
import type { User, AiModel } from '~/lib/schema';

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

export function AdminClientWrapper({ currentUser, users, models }: AdminClientWrapperProps) {
  const displayName = currentUser.firstName || currentUser.email || currentUser.id;
  
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
          <Stack>
            {users.map(user => (
              <div key={user.id} style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                <Text>{user.clerkId}</Text>
                <Text>{user.role}</Text>
                <UserRoleForm userId={user.clerkId} initialRole={user.role} />
              </div>
            ))}
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="models" pt="xl">
          <AiModelsClient initialModels={models} />
        </Tabs.Panel>
      </Tabs>
    </Container>
  );
} 