import { render, screen } from '@testing-library/react';
import { NavBar } from '~/components/NavBar';
import { TestWrapper } from '../utils';
import userEvent from '@testing-library/user-event';
import { useRouter } from 'next/navigation';

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: jest.fn()
}));

// Mock Clerk
jest.mock('@clerk/nextjs', () => ({
  UserButton: () => <button data-testid="user-button">User Button</button>
}));

describe('NavBar', () => {
  const mockPush = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue({ push: mockPush });
  });

  it('renders all navigation links', () => {
    render(
      <TestWrapper>
        <NavBar />
      </TestWrapper>
    );
    
    expect(screen.getByText('Enterprise App')).toBeInTheDocument();
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Admin')).toBeInTheDocument();
    expect(screen.getByTestId('user-button')).toBeInTheDocument();
  });

  it('renders links with correct href attributes', () => {
    render(
      <TestWrapper>
        <NavBar />
      </TestWrapper>
    );
    
    const homeLink = screen.getByText('Enterprise App').closest('a');
    const dashboardLink = screen.getByText('Dashboard').closest('a');
    const adminLink = screen.getByText('Admin').closest('a');

    expect(homeLink).toHaveAttribute('href', '/');
    expect(dashboardLink).toHaveAttribute('href', '/dashboard');
    expect(adminLink).toHaveAttribute('href', '/admin');
  });

  it('renders UserButton with correct props', () => {
    render(
      <TestWrapper>
        <NavBar />
      </TestWrapper>
    );
    
    const userButton = screen.getByTestId('user-button');
    expect(userButton).toBeInTheDocument();
  });

  it('maintains layout structure', () => {
    render(
      <TestWrapper>
        <NavBar />
      </TestWrapper>
    );
    
    const header = screen.getByRole('banner');
    expect(header).toHaveClass('h-[60px]');
    expect(header).toHaveClass('border-b');
  });
}); 