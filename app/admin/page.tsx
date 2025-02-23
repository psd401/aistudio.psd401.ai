"use server"

import { db } from '@/db/db';
import { usersTable, aiModelsTable } from '@/db/schema';
import { AdminClientWrapper } from './components/AdminClientWrapper';
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { hasRole } from '@/utils/roles';
import { eq } from 'drizzle-orm';

export default async function AdminPage() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  const isAdmin = await hasRole(userId, 'administrator');
  if (!isAdmin) redirect('/');

  const users = await db.select().from(usersTable);
  const models = await db.select().from(aiModelsTable);

  const [currentUser] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.clerkId, userId));

  if (!currentUser) redirect('/sign-in');

  return <AdminClientWrapper currentUser={currentUser} users={users} models={models} />;
} 