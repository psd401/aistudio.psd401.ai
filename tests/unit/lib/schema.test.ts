import { describe, it, expect } from '@jest/globals';
import { users } from '../../../lib/schema';
import { sql } from 'drizzle-orm';

describe('Database Schema', () => {
  describe('Users Table', () => {
    it('has correct table name', () => {
      expect(users.name).toBe('users');
    });

    it('has required columns', () => {
      const columnNames = Object.keys(users);
      expect(columnNames).toContain('id');
      expect(columnNames).toContain('clerkId');
      expect(columnNames).toContain('role');
    });

    it('has correct column types', () => {
      expect(users.id.dataType).toBe('serial');
      expect(users.clerkId.dataType).toBe('text');
      expect(users.role.dataType).toBe('text');
    });

    it('has correct constraints', () => {
      expect(users.id.primaryKey).toBe(true);
      expect(users.clerkId.notNull).toBe(true);
      expect(users.role.notNull).toBe(true);
      expect(users.clerkId.unique).toBe(true);
    });

    it('has correct default values', () => {
      expect(users.role.default).toBe('Staff');
    });
  });
}); 