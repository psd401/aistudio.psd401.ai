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
      expect(columnNames).toContain('cognitoSub');
      expect(columnNames).toContain('email');
      expect(columnNames).toContain('name');
      expect(columnNames).toContain('createdAt');
      expect(columnNames).toContain('updatedAt');
    });

    it('has correct column types', () => {
      expect(users.id.dataType).toBe('text');
      expect(users.cognitoSub.dataType).toBe('varchar');
      expect(users.cognitoSub.notNull).toBe(true);
      expect(users.cognitoSub.unique).toBe(true);
      expect(users.email.dataType).toBe('varchar');
      expect(users.name.dataType).toBe('varchar');
    });

    it('has correct constraints', () => {
      expect(users.id.primaryKey).toBe(true);
      expect(users.cognitoSub.notNull).toBe(true);
      expect(users.cognitoSub.unique).toBe(true);
      expect(users.email.notNull).toBe(true);
      expect(users.name.notNull).toBe(true);
    });

    it('has correct default values', () => {
      expect(users.role.default).toBe('Staff');
    });
  });
}); 