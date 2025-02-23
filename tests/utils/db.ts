import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@/db/schema';

// Use a test database URL for testing
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;

if (!TEST_DATABASE_URL) {
  throw new Error('Missing database URL for tests');
}

const client = postgres(TEST_DATABASE_URL);
export const testDb = drizzle(client, { schema });

export async function cleanupDatabase() {
  await testDb.delete(schema.users);
}

export async function createTestUser(clerkId: string, role: string = 'Staff') {
  const [user] = await testDb
    .insert(schema.users)
    .values({
      clerkId,
      role,
    })
    .returning();
  return user;
} 