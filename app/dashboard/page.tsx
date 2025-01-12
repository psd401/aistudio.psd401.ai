import { auth, currentUser } from '@clerk/nextjs';
import { Container, Title, Text, Paper } from '@mantine/core';
import { redirect } from 'next/navigation';
import { db } from '~/lib/db';
import { users } from '~/lib/schema';
import { eq } from 'drizzle-orm';

export default async function DashboardPage() {
  const { userId } = auth();
  const user = await currentUser();

  if (!userId || !user) {
    redirect('/');
  }

  // First check if user exists
  const existingUser = await db.query.users.findFirst({
    where: eq(users.clerkId, userId),
  });

  // If user doesn't exist, create with default role
  const dbUser = existingUser || (await db
    .insert(users)
    .values({
      clerkId: userId,
      role: 'Staff',
    })
    .returning()
    .then(rows => rows[0]));

  return (
    <Container size="lg" py="xl">
      <Title>Dashboard</Title>
      <Paper shadow="xs" p="md" mt="xl">
        <Text>Welcome back, {user.firstName}!</Text>
        <Text mt="sm">Role: {dbUser.role}</Text>
      </Paper>
    </Container>
  );
} 