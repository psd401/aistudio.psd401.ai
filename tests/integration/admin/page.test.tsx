import { auth } from '@clerk/nextjs';
import { redirect } from 'next/navigation';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import AdminPage from '../../../app/admin/page';
import { db } from '../../../lib/db';

interface RedirectError extends Error {
  digest?: string;
}

const mockRedirect = (path: string) => {
  const error = new Error('NEXT_REDIRECT') as RedirectError;
  error.digest = 'NEXT_REDIRECT';
  throw error;
};

jest.mock('next/navigation', () => ({
  redirect: jest.fn().mockImplementation(mockRedirect)
}));

jest.mock('@clerk/nextjs', () => ({
  auth: jest.fn()
}));

jest.mock('../../../lib/db', () => ({
  db: {
    query: {
      users: {
        findMany: jest.fn().mockResolvedValue([
          { id: 1, email: 'user1@example.com', role: 'Staff' },
          { id: 2, email: 'user2@example.com', role: 'Staff' }
        ])
      }
    }
  }
}));

describe('AdminPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('redirects to home page when user is not authenticated', async () => {
    (auth as jest.Mock).mockResolvedValue({ userId: null });

    try {
      await render(<AdminPage />);
      fail('Expected redirect to be called');
    } catch (error) {
      const redirectError = error as RedirectError;
      expect(redirectError.digest).toBe('NEXT_REDIRECT');
      expect(mockRedirect).toHaveBeenCalledWith('/');
    }
  });

  it('redirects to dashboard for non-admin user', async () => {
    (auth as jest.Mock).mockResolvedValue({ userId: 'user-1' });
    (db.query.users.findMany as jest.Mock).mockResolvedValue([
      { id: 'user-1', role: 'Staff' }
    ]);

    try {
      await render(<AdminPage />);
      fail('Expected redirect to be called');
    } catch (error) {
      const redirectError = error as RedirectError;
      expect(redirectError.digest).toBe('NEXT_REDIRECT');
      expect(mockRedirect).toHaveBeenCalledWith('/dashboard');
    }
  });

  it('renders admin dashboard for admin user', async () => {
    (auth as jest.Mock).mockResolvedValue({ userId: 'admin-user' });
    (db.query.users.findMany as jest.Mock).mockResolvedValue([
      { id: 'admin-user', role: 'Admin' }
    ]);

    render(<AdminPage />);
    
    expect(await screen.findByText('Admin Dashboard')).toBeInTheDocument();
  });

  it('shows error message when database query fails', async () => {
    (auth as jest.Mock).mockResolvedValue({ userId: 'admin-user' });
    (db.query.users.findMany as jest.Mock).mockRejectedValue(new Error('Database error'));

    render(<AdminPage />);
    
    expect(await screen.findByText('Error loading users')).toBeInTheDocument();
  });
}); 