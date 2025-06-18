// Load environment variables from .env.local FIRST
import { config } from 'dotenv';
import path from 'path';
import { URL } from 'url';

// Load .env.local file
config({ path: path.resolve(process.cwd(), '.env.local') });

// Now check if DATABASE_URL is set
if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL is not set in .env.local');
  console.error('Please ensure your .env.local file contains: DATABASE_URL=postgresql://...');
  process.exit(1);
}

// Parse the DATABASE_URL to show connection details
const dbUrl = new URL(process.env.DATABASE_URL);
console.log('\n📊 Database Connection Details:');
console.log('  Host:', dbUrl.hostname);
console.log('  Port:', dbUrl.port);
console.log('  Database:', dbUrl.pathname.slice(1));
console.log('  Username:', dbUrl.username);
console.log('  Using RDS Proxy:', dbUrl.hostname.includes('proxy'));
console.log('  Using SSL:', process.env.DATABASE_URL.includes('sslmode=require'));
console.log('\n');

// Only import db after environment is loaded
const { db } = require('../db/db');
const { sql } = require('drizzle-orm');

async function testConnection() {
  console.log('Testing database connection...');
  console.log('DATABASE_URL:', process.env.DATABASE_URL?.replace(/:[^:@]+@/, ':****@')); // Hide password
  
  try {
    // Simple query to test connection
    const result = await db.execute(sql`SELECT current_database(), current_user, version()`);
    console.log('✅ Database connection successful!');
    console.log('Database info:', result);
    
    // Test a simple table query
    const tables = await db.execute(sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      LIMIT 5
    `);
    console.log('Tables found:', tables);
    
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
      
      // Provide helpful suggestions based on the error
      if (error.message.includes('CONNECT_TIMEOUT') || error.message.includes('ETIMEDOUT')) {
        console.log('\n💡 Suggestions:');
        console.log('  1. Check if the RDS proxy is publicly accessible');
        console.log('  2. Try using the cluster endpoint directly instead of the proxy');
        console.log('  3. Ensure your IP is allowed in the security group');
        console.log('  4. Check if you need to use a VPN or bastion host');
        console.log('\n  To get the cluster endpoint, check your AWS CloudFormation outputs');
        console.log('  or RDS console for the Aurora cluster endpoint.');
        console.log('\n📝 Example DATABASE_URL formats:');
        console.log('  Proxy:   postgresql://user:pass@proxy-name.proxy-xxx.region.rds.amazonaws.com:5432/dbname');
        console.log('  Cluster: postgresql://user:pass@cluster-name.cluster-xxx.region.rds.amazonaws.com:5432/dbname');
        console.log('  Local:   postgresql://user:pass@localhost:5432/dbname (with SSH tunnel)');
      }
    }
  }
  
  process.exit(0);
}

testConnection(); 