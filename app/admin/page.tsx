import { currentUser } from '@clerk/nextjs/server';
import { Container, Title, Text, Stack, Code } from '@mantine/core';
import { db } from '~/lib/db';
import { users, aiModels } from '~/lib/schema';
import { eq } from 'drizzle-orm';
import { hasRole, syncUserRole } from '~/utils/roles';
import { AdminClientWrapper } from './components/AdminClientWrapper';

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

  // Check if user has administrator role
  const isAdmin = await hasRole(user.id, 'administrator');

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
          <Text>You do not have administrator privileges.</Text>
          <Text>Debug Information:</Text>
          <Code block>{JSON.stringify(debugInfo, null, 2)}</Code>
        </Stack>
      </Container>
    );
  }

  const allUsers = await db.query.users.findMany();
  const allModels = await db.select().from(aiModels).orderBy(aiModels.name);

  // Only pass the properties we need
  const currentUserData = {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.emailAddresses[0]?.emailAddress
  };

  return <AdminClientWrapper currentUser={currentUserData} users={allUsers} models={allModels} />;
} 