"use server"

import { db } from '@/db/db';
import { usersTable, aiModelsTable, rolesTable, toolsTable } from '@/db/schema';
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

  const [currentUser] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId));

  if (!currentUser) redirect('/sign-in');

  const [users, models, roles, tools] = await Promise.all([
    db.select().from(usersTable),
    db.select().from(aiModelsTable),
    db.select().from(rolesTable),
    db.select().from(toolsTable)
  ]);

  return (
    <AdminClientWrapper 
      currentUser={currentUser} 
      users={users} 
      models={models}
      roles={roles}
      tools={tools}
    />
  );
} 