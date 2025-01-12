import { auth } from '@clerk/nextjs';
import { redirect } from 'next/navigation';
import { Container, Title, Table, Text } from '@mantine/core';
import { db } from '~/lib/db';
import { users } from '~/lib/schema';
import { eq } from 'drizzle-orm';
import { UserRoleForm } from '~/components/UserRoleForm';

export default async function AdminPage() {
  const { userId } = auth();
  if (!userId) redirect('/');

  const currentUser = await db.query.users.findFirst({
    where: eq(users.clerkId, userId)
  });

  if (!currentUser || currentUser.role !== 'Admin') {
    redirect('/dashboard');
  }

  const allUsers = await db.query.users.findMany();

  return (
    <Container>
      <Title>Admin Dashboard</Title>
      <Text>Welcome back, {currentUser.clerkId}!</Text>
      
      <Table mt="lg">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>User ID</Table.Th>
            <Table.Th>Role</Table.Th>
            <Table.Th>Actions</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {allUsers.map(user => (
            <Table.Tr key={user.id}>
              <Table.Td>{user.clerkId}</Table.Td>
              <Table.Td>{user.role}</Table.Td>
              <Table.Td>
                <UserRoleForm userId={user.clerkId} initialRole={user.role} />
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Container>
  );
} 