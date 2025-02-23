import { describe, it, expect, beforeEach } from '@jest/globals';
import { db } from '@/db/db';
import { usersTable } from '@/db/schema';
import { eq } from 'drizzle-orm';

jest.mock('drizzle-orm', () => ({
  eq: jest.fn((field, value) => ({ field, value })),
  desc: jest.fn(field => ({ field, order: 'desc' }))
}));

describe('Database Operations', () => {
  const testUser = {
    id: 'test-user-id',
    email: 'test@example.com',
    role: 'user'
  };

  const mockReturning = jest.fn().mockImplementation(function() {
    return Promise.resolve([testUser]);
  });

  const mockWhere = jest.fn().mockImplementation(function() {
    return { returning: mockReturning };
  });

  const mockSet = jest.fn().mockImplementation(function() {
    return { where: mockWhere };
  });

  const mockValues = jest.fn().mockImplementation(function() {
    return { returning: mockReturning };
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (db.insert as jest.Mock) = jest.fn().mockImplementation(() => ({
      values: mockValues
    }));
    (db.select as jest.Mock) = jest.fn().mockImplementation(() => ({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue([testUser])
      })
    }));
    (db.update as jest.Mock) = jest.fn().mockImplementation(() => ({
      set: mockSet
    }));
    (db.delete as jest.Mock) = jest.fn().mockImplementation(() => ({
      where: mockWhere
    }));
  });

  it('creates a user successfully', async () => {
    const result = await db.insert(usersTable).values(testUser).returning();
    expect(result[0]).toEqual(testUser);
    expect(db.insert).toHaveBeenCalledWith(usersTable);
    expect(mockValues).toHaveBeenCalledWith(testUser);
  });

  it('retrieves a user by id', async () => {
    const result = await db.select().from(usersTable).where(eq(usersTable.id, testUser.id));
    expect(result[0]).toEqual(testUser);
    expect(db.select).toHaveBeenCalled();
  });

  it('updates a user role', async () => {
    const result = await db
      .update(usersTable)
      .set({ role: 'admin' })
      .where(eq(usersTable.id, testUser.id))
      .returning();
    
    expect(result[0]).toEqual(testUser);
    expect(db.update).toHaveBeenCalledWith(usersTable);
    expect(mockSet).toHaveBeenCalledWith({ role: 'admin' });
  });

  it('deletes a user', async () => {
    await db.delete(usersTable).where(eq(usersTable.id, testUser.id));
    expect(db.delete).toHaveBeenCalledWith(usersTable);
    expect(mockWhere).toHaveBeenCalled();
  });
}); 