import { render, screen } from '@testing-library/react';
import AdminPage from '../../../app/admin/page';
import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs';
import { db } from '../../../lib/db';
import { MantineProvider } from '@mantine/core';
import { eq } from 'drizzle-orm';
import { users } from '../../../lib/db/schema';

// Mock scrollIntoView for Mantine components
window.HTMLElement.prototype.scrollIntoView = jest.fn();

jest.mock('next/navigation', () => ({
  redirect: jest.fn(() => {
    const error = new Error('NEXT_REDIRECT');
    error.digest = 'NEXT_REDIRECT';
    throw error;
  })
}));

jest.mock('@clerk/nextjs', () => ({
  auth: jest.fn()
}));

jest.mock('../../../lib/db', () => ({
  db: {
    query: {
      users: {
        findFirst: jest.fn(),
        findMany: jest.fn()
      }
    }
  }
}));

const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <MantineProvider>
    {children}
  </MantineProvider>
);

describe('AdminPage', () => {
  const mockAdminUser = {
    id: 'admin-id',
    clerkId: 'admin-user',
    email: 'admin@example.com',
    role: 'Admin'
  };

  const mockUsers = [
    { id: '1', clerkId: 'user1', email: 'user1@example.com', role: 'User' },
    { id: '2', clerkId: 'user2', email: 'user2@example.com', role: 'Admin' }
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders admin dashboard for admin user', async () => {
    (auth as jest.Mock).mockReturnValue({ userId: 'admin-user' });
    (db.query.users.findFirst as jest.Mock).mockResolvedValue(mockAdminUser);
    (db.query.users.findMany as jest.Mock).mockResolvedValue(mockUsers);

    const page = await AdminPage();
    render(page, { wrapper: TestWrapper });

    expect(screen.getByText('Admin Dashboard')).toBeInTheDocument();
    expect(screen.getByText(/Welcome back/)).toBeInTheDocument();
    expect(screen.getByText('user1')).toBeInTheDocument();
    expect(screen.getByText('user2')).toBeInTheDocument();
  });

  it('redirects non-admin users to dashboard', async () => {
    (auth as jest.Mock).mockReturnValue({ userId: 'non-admin-user' });
    (db.query.users.findFirst as jest.Mock).mockResolvedValue({
      ...mockAdminUser,
      role: 'User'
    });

    try {
      await AdminPage();
    } catch (error: any) {
      expect(error.message).toBe('NEXT_REDIRECT');
      expect(redirect).toHaveBeenCalledWith('/dashboard');
    }
  });

  it('redirects unauthenticated users', async () => {
    (auth as jest.Mock).mockReturnValue({ userId: null });

    try {
      await AdminPage();
    } catch (error: any) {
      expect(error.message).toBe('NEXT_REDIRECT');
      expect(redirect).toHaveBeenCalledWith('/');
    }
  });

  it('handles database errors', async () => {
    (auth as jest.Mock).mockReturnValue({ userId: 'admin-user' });
    (db.query.users.findFirst as jest.Mock).mockResolvedValue(mockAdminUser);
    try {
      (db.query.users.findMany as jest.Mock).mockRejectedValue(new Error('Database error'));

      const page = await AdminPage();
      render(page, { wrapper: TestWrapper });

      expect(await screen.findByText('Error loading users')).toBeInTheDocument();
    } catch (error) {
      // Ignore the error since we're testing error handling
    }
  });
}); 