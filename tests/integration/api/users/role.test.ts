import { describe, it, expect, beforeEach } from '@jest/globals';
import { testDb, cleanupDatabase, createTestUser } from '../../../utils/db';
import { auth } from '@clerk/nextjs';
import { PUT } from '../../../../app/api/users/role/route';

jest.mock('@clerk/nextjs', () => ({
  auth: jest.fn()
}));

describe('User Role API Integration', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await cleanupDatabase();
  });

  it('updates user role successfully', async () => {
    // Create test users
    const adminUser = await createTestUser('admin-id', 'Admin');
    const targetUser = await createTestUser('target-id', 'Staff');

    // Mock admin authentication
    (auth as jest.Mock).mockReturnValue({ userId: 'admin-id' });

    const request = new Request('http://localhost/api/users/role', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetUserId: 'target-id',
        role: 'Admin'
      })
    });

    const response = await PUT(request);
    expect(response.status).toBe(200);

    // Verify database update
    const updatedUser = await testDb.query.users.findFirst({
      where: (users, { eq }) => eq(users.clerkId, 'target-id')
    });
    expect(updatedUser?.role).toBe('Admin');
  });

  it('prevents non-admin users from updating roles', async () => {
    // Create test users
    const staffUser = await createTestUser('staff-id', 'Staff');
    const targetUser = await createTestUser('target-id', 'Staff');

    // Mock non-admin authentication
    (auth as jest.Mock).mockReturnValue({ userId: 'staff-id' });

    const request = new Request('http://localhost/api/users/role', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetUserId: 'target-id',
        role: 'Admin'
      })
    });

    const response = await PUT(request);
    expect(response.status).toBe(403);

    // Verify database was not updated
    const unchangedUser = await testDb.query.users.findFirst({
      where: (users, { eq }) => eq(users.clerkId, 'target-id')
    });
    expect(unchangedUser?.role).toBe('Staff');
  });

  it('handles invalid role values', async () => {
    // Create test users
    const adminUser = await createTestUser('admin-id', 'Admin');
    const targetUser = await createTestUser('target-id', 'Staff');

    // Mock admin authentication
    (auth as jest.Mock).mockReturnValue({ userId: 'admin-id' });

    const request = new Request('http://localhost/api/users/role', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetUserId: 'target-id',
        role: 'InvalidRole'
      })
    });

    const response = await PUT(request);
    expect(response.status).toBe(400);

    // Verify database was not updated
    const unchangedUser = await testDb.query.users.findFirst({
      where: (users, { eq }) => eq(users.clerkId, 'target-id')
    });
    expect(unchangedUser?.role).toBe('Staff');
  });

  it('handles non-existent users', async () => {
    // Create admin user
    const adminUser = await createTestUser('admin-id', 'Admin');

    // Mock admin authentication
    (auth as jest.Mock).mockReturnValue({ userId: 'admin-id' });

    const request = new Request('http://localhost/api/users/role', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetUserId: 'non-existent-id',
        role: 'Admin'
      })
    });

    const response = await PUT(request);
    expect(response.status).toBe(404);
  });

  it('handles database errors gracefully', async () => {
    // Create admin user
    const adminUser = await createTestUser('admin-id', 'Admin');

    // Mock admin authentication
    (auth as jest.Mock).mockReturnValue({ userId: 'admin-id' });

    // Mock database error
    jest.spyOn(testDb, 'update').mockRejectedValueOnce(new Error('Database error'));

    const request = new Request('http://localhost/api/users/role', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetUserId: 'target-id',
        role: 'Admin'
      })
    });

    const response = await PUT(request);
    expect(response.status).toBe(500);
  });
}); 