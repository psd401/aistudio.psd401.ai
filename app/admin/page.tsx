import { currentUser } from '@clerk/nextjs/server';
import { Container, Title, Text, Stack, Code } from '@mantine/core';
import { db } from '~/lib/db';
import { users } from '~/lib/schema';
import { eq } from 'drizzle-orm';
import { UserRoleForm } from '~/components/UserRoleForm';
import { hasRole, syncUserRole } from '~/utils/roles';

export default async function AdminPage() {
  const user = await currentUser();
  if (!user?.id) return (
    <Container>
      <Title>Not Authenticated</Title>
      <Text>Please sign in to continue.</Text>
    </Container>
  );

  // Get user directly from DB first for debugging
  const dbUser = await db.query.users.findFirst({
    where: eq(users.clerkId, user.id)
  });
  const dbRole = dbUser?.role;

  // Sync user's role with Clerk metadata
  const userRole = await syncUserRole(user.id);

  // Check if user has admin role
  const isAdmin = await hasRole(user.id, 'Admin');

  const debugInfo = {
    userId: user.id,
    dbRole,
    userRole,
    isAdmin,
  };

  if (!isAdmin) {
    return (
      <Container>
        <Stack>
          <Title>Access Denied</Title>
          <Text>You do not have admin privileges.</Text>
          <Text>Debug Information:</Text>
          <Code block>{JSON.stringify(debugInfo, null, 2)}</Code>
        </Stack>
      </Container>
    );
  }

  const allUsers = await db.query.users.findMany();

  return (
    <Container>
      <Title>Admin Dashboard</Title>
      <Text>Welcome back, {user.firstName || user.id}!</Text>
      
      <Stack mt="lg">
        {allUsers.map(user => (
          <div key={user.id} style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <Text>{user.clerkId}</Text>
            <Text>{user.role}</Text>
            <UserRoleForm userId={user.clerkId} initialRole={user.role} />
          </div>
        ))}
      </Stack>
    </Container>
  );
} 