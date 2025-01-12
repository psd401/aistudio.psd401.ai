import { render, screen } from '@testing-library/react';
import { auth } from '@clerk/nextjs';
import { redirect } from 'next/navigation';
import { db } from '../../lib/db';
import AdminPage from '../../app/admin/page';
import { TestWrapper } from '../utils';

interface RedirectError extends Error {
  digest?: string;
}

// Mock next/navigation
jest.mock('next/navigation', () => ({
  redirect: jest.fn().mockImplementation(() => {
    const error = new Error('NEXT_REDIRECT') as RedirectError;
    error.digest = 'NEXT_REDIRECT';
    throw error;
  })
}));

// Mock @clerk/nextjs
jest.mock('@clerk/nextjs', () => ({
  auth: jest.fn()
}));

// Mock db
jest.mock('../../lib/db', () => ({
  db: {
    query: {
      users: {
        findFirst: jest.fn(),
        findMany: jest.fn()
      }
    }
  }
}));

describe('Admin Page Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('redirects to home page when user is not authenticated', async () => {
    (auth as jest.Mock).mockReturnValue({ userId: null });

    try {
      render(<AdminPage />, { wrapper: TestWrapper });
      fail('Expected redirect to throw');
    } catch (error: any) {
      expect(error.digest).toBe('NEXT_REDIRECT');
      expect(redirect).toHaveBeenCalledWith('/');
    }
  });

  it('redirects to dashboard when user is not admin', async () => {
    (auth as jest.Mock).mockReturnValue({ userId: 'user-1' });
    (db.query.users.findFirst as jest.Mock).mockResolvedValue({ role: 'User' });

    try {
      render(<AdminPage />, { wrapper: TestWrapper });
      fail('Expected redirect to throw');
    } catch (error: any) {
      expect(error.digest).toBe('NEXT_REDIRECT');
      expect(redirect).toHaveBeenCalledWith('/dashboard');
    }
  });

  it('displays admin dashboard for admin user', async () => {
    (auth as jest.Mock).mockReturnValue({ userId: 'admin-1' });
    (db.query.users.findFirst as jest.Mock).mockResolvedValue({ role: 'Admin' });
    (db.query.users.findMany as jest.Mock).mockResolvedValue([
      { id: 1, email: 'user1@example.com', role: 'User' },
      { id: 2, email: 'user2@example.com', role: 'Staff' }
    ]);

    render(<AdminPage />, { wrapper: TestWrapper });

    expect(await screen.findByText('Admin Dashboard')).toBeInTheDocument();
    expect(await screen.findByText('user1@example.com')).toBeInTheDocument();
    expect(await screen.findByText('user2@example.com')).toBeInTheDocument();
  });

  it('displays error message when database query fails', async () => {
    (auth as jest.Mock).mockReturnValue({ userId: 'admin-1' });
    (db.query.users.findFirst as jest.Mock).mockResolvedValue({ role: 'Admin' });
    (db.query.users.findMany as jest.Mock).mockRejectedValue(new Error('Database error'));

    render(<AdminPage />, { wrapper: TestWrapper });

    expect(await screen.findByText('Error loading users')).toBeInTheDocument();
  });
}); 