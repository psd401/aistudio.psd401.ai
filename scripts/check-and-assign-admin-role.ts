import { config } from 'dotenv';
import { executeSQL } from '../lib/db/data-api-adapter';
import { getServerSession } from '../lib/auth/server-session';

// Load environment variables
config({ path: '.env.local' });

async function checkAndAssignAdminRole() {
  try {
    console.log('Starting role assignment check...\n');

    // 1. Check if there are any records in the user_roles table
    console.log('1. Checking user_roles table...');
    const userRolesQuery = 'SELECT COUNT(*) as count FROM user_roles';
    const userRolesResult = await executeSQL(userRolesQuery);
    console.log(`   User roles count: ${userRolesResult[0].count}`);

    // 2. Check what roles exist in the roles table
    console.log('\n2. Checking available roles...');
    const rolesQuery = 'SELECT id, name, description FROM roles ORDER BY name';
    const rolesResult = await executeSQL(rolesQuery);
    console.log('   Available roles:');
    rolesResult.forEach((role: any) => {
      console.log(`   - ID: ${role.id}, Name: ${role.name}, Description: ${role.description || 'N/A'}`);
    });

    // Find the administrator role
    const adminRole = rolesResult.find((role: any) => role.name === 'administrator');
    if (!adminRole) {
      console.error('\n❌ Error: Administrator role not found in the database!');
      process.exit(1);
    }
    console.log(`\n   ✓ Found administrator role with ID: ${adminRole.id}`);

    // 3. Get the current user's Cognito sub
    // Note: Since this is a script, we'll need to provide the Cognito sub as an argument
    const cognitoSub = process.argv[2];
    if (!cognitoSub) {
      console.error('\n❌ Error: Please provide your Cognito sub as an argument');
      console.log('Usage: npm run ts-node scripts/check-and-assign-admin-role.ts <your-cognito-sub>');
      console.log('\nTo find your Cognito sub:');
      console.log('1. Log into the application');
      console.log('2. Check the browser\'s localStorage or cookies for Cognito user info');
      console.log('3. Or check AWS Cognito User Pool in the AWS Console');
      process.exit(1);
    }

    console.log(`\n3. Finding user with Cognito sub: ${cognitoSub}`);
    const userQuery = `
      SELECT id, email, first_name, last_name, cognito_sub 
      FROM users 
      WHERE cognito_sub = :cognitoSub
    `;
    const userParams = [
      { name: 'cognitoSub', value: { stringValue: cognitoSub } }
    ];
    const userResult = await executeSQL(userQuery, userParams);

    if (userResult.length === 0) {
      console.error(`\n❌ Error: No user found with Cognito sub: ${cognitoSub}`);
      console.log('\nPlease ensure:');
      console.log('1. You have logged into the application at least once');
      console.log('2. The Cognito sub is correct');
      process.exit(1);
    }

    const user = userResult[0];
    console.log(`   ✓ Found user: ${user.email} (ID: ${user.id})`);

    // 4. Check if user already has the administrator role
    console.log('\n4. Checking current user roles...');
    const checkRoleQuery = `
      SELECT r.name 
      FROM user_roles ur
      JOIN roles r ON ur.role_id = r.id
      WHERE ur.user_id = :userId
    `;
    const checkRoleParams = [
      { name: 'userId', value: { longValue: user.id } }
    ];
    const currentRoles = await executeSQL(checkRoleQuery, checkRoleParams);

    if (currentRoles.length > 0) {
      console.log('   Current roles:');
      currentRoles.forEach((role: any) => {
        console.log(`   - ${role.name}`);
      });

      const hasAdminRole = currentRoles.some((role: any) => role.name === 'administrator');
      if (hasAdminRole) {
        console.log('\n✅ User already has administrator role!');
        return;
      }
    } else {
      console.log('   User has no roles assigned');
    }

    // 5. Assign administrator role to the user
    console.log('\n5. Assigning administrator role...');
    const assignRoleQuery = `
      INSERT INTO user_roles (user_id, role_id, created_at, updated_at)
      VALUES (:userId, :roleId, NOW(), NOW())
      ON CONFLICT (user_id, role_id) DO NOTHING
      RETURNING *
    `;
    const assignRoleParams = [
      { name: 'userId', value: { longValue: user.id } },
      { name: 'roleId', value: { longValue: adminRole.id } }
    ];

    try {
      const assignResult = await executeSQL(assignRoleQuery, assignRoleParams);
      if (assignResult.length > 0) {
        console.log('   ✓ Administrator role successfully assigned!');
      } else {
        console.log('   ✓ Role assignment completed (may have already existed)');
      }
    } catch (error: any) {
      // Handle the case where ON CONFLICT is not supported
      if (error.message?.includes('ON CONFLICT')) {
        console.log('   Attempting alternative insert method...');
        const altAssignQuery = `
          INSERT INTO user_roles (user_id, role_id, created_at, updated_at)
          SELECT :userId, :roleId, NOW(), NOW()
          WHERE NOT EXISTS (
            SELECT 1 FROM user_roles 
            WHERE user_id = :userId AND role_id = :roleId
          )
        `;
        await executeSQL(altAssignQuery, assignRoleParams);
        console.log('   ✓ Administrator role successfully assigned!');
      } else {
        throw error;
      }
    }

    // 6. Verify the assignment
    console.log('\n6. Verifying role assignment...');
    const verifyResult = await executeSQL(checkRoleQuery, checkRoleParams);
    const finalRoles = verifyResult.map((r: any) => r.name);
    console.log('   Final user roles:', finalRoles.join(', '));

    if (finalRoles.includes('administrator')) {
      console.log('\n✅ Success! User now has administrator role.');
    } else {
      console.log('\n⚠️  Warning: Role assignment may have failed. Please check manually.');
    }

  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

// Run the script
checkAndAssignAdminRole();