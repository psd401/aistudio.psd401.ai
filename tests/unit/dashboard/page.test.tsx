import { render, screen } from '@testing-library/react';
import DashboardPage from '../../../app/dashboard/page';
import { auth, currentUser } from '@clerk/nextjs';
import { redirect } from 'next/navigation';
import { db } from '../../../lib/db';
import { TestWrapper } from '../../utils';

// Mock next/navigation
jest.mock('next/navigation', () => ({
  redirect: jest.fn().mockImplementation(() => {
    const error = new Error('NEXT_REDIRECT');
    error.digest = 'NEXT_REDIRECT';
    throw error;
  })
}));

// Mock Clerk
jest.mock('@clerk/nextjs', () => ({
  auth: jest.fn(),
  currentUser: jest.fn()
}));

// Mock db
jest.mock('../../../lib/db', () => ({
  db: {
    query: {
      users: {
        findFirst: jest.fn()
      }
    },
    insert: jest.fn().mockReturnValue({
      values: jest.fn().mockReturnValue({
        returning: jest.fn().mockResolvedValue([
          { id: 1, clerkId: 'user-1', role: 'Staff' }
        ])
      })
    })
  }
}));

describe('DashboardPage', () => {
  const mockUser = {
    id: 'user-1',
    firstName: 'Test',
    lastName: 'User'
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('redirects to home when user is not authenticated', async () => {
    (auth as jest.Mock).mockReturnValue({ userId: null });
    (currentUser as jest.Mock).mockResolvedValue(null);

    try {
      await render(<DashboardPage />, { wrapper: TestWrapper });
      fail('Expected redirect to be called');
    } catch (error: any) {
      expect(error.digest).toBe('NEXT_REDIRECT');
      expect(redirect).toHaveBeenCalledWith('/');
    }
  });

  it('creates new user if not exists', async () => {
    (auth as jest.Mock).mockReturnValue({ userId: 'user-1' });
    (currentUser as jest.Mock).mockResolvedValue(mockUser);
    (db.query.users.findFirst as jest.Mock).mockResolvedValue(null);

    render(<DashboardPage />, { wrapper: TestWrapper });

    expect(db.insert).toHaveBeenCalled();
    expect(await screen.findByText('Welcome back, Test!')).toBeInTheDocument();
    expect(await screen.findByText('Role: Staff')).toBeInTheDocument();
  });

  it('displays existing user data', async () => {
    (auth as jest.Mock).mockReturnValue({ userId: 'user-1' });
    (currentUser as jest.Mock).mockResolvedValue(mockUser);
    (db.query.users.findFirst as jest.Mock).mockResolvedValue({
      id: 1,
      clerkId: 'user-1',
      role: 'Admin'
    });

    render(<DashboardPage />, { wrapper: TestWrapper });

    expect(await screen.findByText('Welcome back, Test!')).toBeInTheDocument();
    expect(await screen.findByText('Role: Admin')).toBeInTheDocument();
  });

  it('handles database errors gracefully', async () => {
    (auth as jest.Mock).mockReturnValue({ userId: 'user-1' });
    (currentUser as jest.Mock).mockResolvedValue(mockUser);
    (db.query.users.findFirst as jest.Mock).mockRejectedValue(new Error('Database error'));

    try {
      render(<DashboardPage />, { wrapper: TestWrapper });
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe('Database error');
    }
  });
}); 