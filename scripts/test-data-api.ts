import { config } from 'dotenv';
import path from 'path';

// Load .env.local file
config({ path: path.resolve(process.cwd(), '.env.local') });

// Import after env is loaded
import { executeSQL, getNavigationItems } from '../lib/db/data-api-adapter';

async function testDataAPI() {
  console.log('🔍 Testing RDS Data API connection...\n');
  
  // Check required environment variables
  const required = ['RDS_RESOURCE_ARN', 'RDS_SECRET_ARN'];
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:', missing.join(', '));
    console.log('\nAdd these to your .env.local:');
    console.log('RDS_RESOURCE_ARN=<your-cluster-arn>');
    console.log('RDS_SECRET_ARN=<your-secret-arn>');
    console.log('\nYou can find these in your AWS CloudFormation outputs or RDS console.');
    process.exit(1);
  }
  
  console.log('📋 Configuration:');
  console.log('  Cluster ARN:', process.env.RDS_RESOURCE_ARN);
  console.log('  Secret ARN:', process.env.RDS_SECRET_ARN);
  console.log('  Database:', process.env.RDS_DATABASE_NAME || 'aistudio');
  console.log('  Region:', process.env.AWS_REGION || process.env.NEXT_PUBLIC_AWS_REGION || 'us-east-1');
  console.log('');
  
  try {
    // Test 1: Simple query
    console.log('Test 1: Simple connection test...');
    const result = await executeSQL('SELECT current_database(), current_user, version()');
    console.log('✅ Connection successful!');
    console.log('Database info:', result[0]);
    
    // Test 2: List tables
    console.log('\nTest 2: Listing tables...');
    const tables = await executeSQL(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      LIMIT 5
    `);
    console.log('✅ Tables found:', tables.map(t => t.table_name));
    
    // Test 2.5: Check navigation_items columns
    console.log('\nTest 2.5: Checking navigation_items columns...');
    const columns = await executeSQL(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'navigation_items' 
      ORDER BY ordinal_position
    `);
    console.log('✅ Columns in navigation_items:', columns);
    
    // Test 3: Navigation items
    console.log('\nTest 3: Fetching navigation items...');
    const navItems = await getNavigationItems();
    console.log('✅ Navigation items found:', navItems.length);
    if (navItems.length > 0) {
      console.log('Sample item:', navItems[0]);
    }
    
    console.log('\n🎉 All tests passed! Data API is working correctly.');
    
  } catch (error: any) {
    console.error('\n❌ Data API test failed:', error.message);
    
    if (error.message.includes('credential')) {
      console.log('\n💡 AWS Credentials Issue:');
      console.log('  Make sure you have AWS credentials configured:');
      console.log('  - Run: aws configure');
      console.log('  - Or set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables');
      console.log('  - Or use AWS SSO: aws sso login');
    } else if (error.message.includes('not authorized')) {
      console.log('\n💡 IAM Permissions Issue:');
      console.log('  Your AWS credentials need permission to:');
      console.log('  - rds-data:ExecuteStatement');
      console.log('  - secretsmanager:GetSecretValue');
    }
  }
  
  process.exit(0);
}

testDataAPI(); 