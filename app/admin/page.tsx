import { currentUser } from '@clerk/nextjs/server';
import { db } from '~/lib/db';
import { users, aiModels } from '~/lib/schema';
import { eq } from 'drizzle-orm';
import { hasRole, syncUserRole } from '~/utils/roles';
import { AdminClientWrapper } from './components/AdminClientWrapper';

export default async function AdminPage() {
  const user = await currentUser();
  if (!user?.id) return (
    <div className="container">
      <h1 className="text-3xl font-bold">Not Authenticated</h1>
      <p className="text-muted-foreground">Please sign in to continue.</p>
    </div>
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
      <div className="container">
        <div className="space-y-4">
          <h1 className="text-3xl font-bold">Access Denied</h1>
          <p className="text-muted-foreground">You do not have administrator privileges.</p>
          <p className="text-muted-foreground">Debug Information:</p>
          <pre className="rounded-lg bg-muted p-4 font-mono text-sm">
            {JSON.stringify(debugInfo, null, 2)}
          </pre>
        </div>
      </div>
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