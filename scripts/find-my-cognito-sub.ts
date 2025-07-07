import { config } from 'dotenv';
import { executeSQL } from '../lib/db/data-api-adapter';

// Load environment variables
config({ path: '.env.local' });

async function findMyCognitoSub() {
  try {
    console.log('Finding users in the database...\n');

    const email = process.argv[2];
    
    if (email) {
      // If email is provided, search for specific user
      console.log(`Searching for user with email: ${email}\n`);
      
      const query = `
        SELECT 
          id,
          cognito_sub,
          email,
          first_name,
          last_name,
          created_at,
          last_sign_in_at
        FROM users 
        WHERE LOWER(email) = LOWER(:email)
      `;
      
      const params = [
        { name: 'email', value: { stringValue: email } }
      ];
      
      const result = await executeSQL(query, params);
      
      if (result.length === 0) {
        console.log(`❌ No user found with email: ${email}`);
        console.log('\nTry running without an email to see all users.');
      } else {
        const user = result[0];
        console.log('Found user:');
        console.log('═══════════════════════════════════════════════════════════════');
        console.log(`ID:              ${user.id}`);
        console.log(`Cognito Sub:     ${user.cognito_sub || 'Not set'}`);
        console.log(`Email:           ${user.email}`);
        console.log(`Name:            ${user.first_name || ''} ${user.last_name || ''}`);
        console.log(`Created:         ${user.created_at}`);
        console.log(`Last Sign In:    ${user.last_sign_in_at || 'Never'}`);
        console.log('═══════════════════════════════════════════════════════════════');
        
        if (user.cognito_sub) {
          console.log(`\n✅ Use this Cognito sub for the admin role assignment:`);
          console.log(`   npm run ts-node scripts/check-and-assign-admin-role.ts ${user.cognito_sub}`);
        } else {
          console.log(`\n⚠️  This user doesn't have a Cognito sub yet.`);
          console.log(`   They may need to log in through AWS Cognito first.`);
        }
      }
    } else {
      // List all users
      console.log('Listing all users in the database:\n');
      
      const query = `
        SELECT 
          id,
          cognito_sub,
          email,
          first_name,
          last_name,
          created_at,
          (
            SELECT STRING_AGG(r.name, ', ' ORDER BY r.name)
            FROM user_roles ur
            JOIN roles r ON ur.role_id = r.id
            WHERE ur.user_id = users.id
          ) as roles
        FROM users 
        ORDER BY created_at DESC
      `;
      
      const result = await executeSQL(query);
      
      if (result.length === 0) {
        console.log('❌ No users found in the database.');
        console.log('\nMake sure you have logged into the application at least once.');
      } else {
        console.log(`Found ${result.length} user(s):\n`);
        
        result.forEach((user: any, index: number) => {
          console.log(`${index + 1}. ${user.email}`);
          console.log(`   ID: ${user.id}`);
          console.log(`   Cognito Sub: ${user.cognito_sub || 'Not set'}`);
          console.log(`   Name: ${user.first_name || ''} ${user.last_name || ''}`);
          console.log(`   Roles: ${user.roles || 'None'}`);
          console.log(`   Created: ${user.created_at}`);
          console.log('');
        });
        
        console.log('═══════════════════════════════════════════════════════════════');
        console.log('\nTo find a specific user, run:');
        console.log('   npm run ts-node scripts/find-my-cognito-sub.ts <email>');
        console.log('\nTo assign admin role to a user, run:');
        console.log('   npm run ts-node scripts/check-and-assign-admin-role.ts <cognito-sub>');
      }
    }
    
  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

// Run the script
findMyCognitoSub();