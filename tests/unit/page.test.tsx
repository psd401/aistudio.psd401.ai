import { render, screen } from '@testing-library/react';
import Home from '@/app/(public)/page';

// Mock aws-amplify
jest.mock('aws-amplify/auth', () => ({
  signIn: jest.fn()
}));

describe('Home', () => {
  it('renders a heading', () => {
    render(<Home />);
    const heading = screen.getByText(/Welcome to PSD AI Studio/i);
    expect(heading).toBeInTheDocument();
  });
}); 