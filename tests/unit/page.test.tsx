import { render, screen } from '@testing-library/react';
import Home from '../../app/page';
import { TestWrapper } from '../utils';

// Mock Clerk
jest.mock('@clerk/nextjs', () => ({
  SignIn: () => <div data-testid="sign-in">Sign In Component</div>
}));

describe('Home Page', () => {
  it('renders welcome message and sign in component', () => {
    render(<Home />, { wrapper: TestWrapper });
    
    expect(screen.getByText('Welcome to Enterprise App Template')).toBeInTheDocument();
    expect(screen.getByText('Please sign in to continue')).toBeInTheDocument();
    expect(screen.getByTestId('sign-in')).toBeInTheDocument();
  });
}); 