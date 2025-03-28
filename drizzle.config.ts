import type { Config } from 'drizzle-kit';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

if (!process.env.DATABASE_URL) {
  throw new Error('Missing env.DATABASE_URL');
}

export default {
  schema: './db/schema/*',
  out: './db/migrations',
  driver: 'postgres',
  dbCredentials: {
    connectionString: process.env.DATABASE_URL!,
  },
  dialect: 'postgresql'
} satisfies Config; 