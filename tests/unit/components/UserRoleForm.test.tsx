import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UserRoleForm } from '../../../components/user/user-role-form';
import { TestWrapper } from '../../utils';

describe('UserRoleForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders form elements correctly', async () => {
    await act(async () => {
      render(<UserRoleForm userId="test-user" initialRole="Staff" />, { wrapper: TestWrapper });
    });
    expect(screen.getByTestId('role-select')).toHaveValue('Staff');
  });

  it('handles role change', async () => {
    await act(async () => {
      render(<UserRoleForm userId="test-user" initialRole="Staff" />, { wrapper: TestWrapper });
    });
    
    const select = screen.getByTestId('role-select');
    await act(async () => {
      await userEvent.click(select);
      await userEvent.click(screen.getByText('Admin'));
    });
    
    expect(select).toHaveValue('Admin');
  });

  it('submits role update successfully', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ message: 'Role updated successfully' })
    });
    global.fetch = mockFetch;

    await act(async () => {
      render(<UserRoleForm userId="test-user" initialRole="Staff" />, { wrapper: TestWrapper });
    });

    const select = screen.getByTestId('role-select');
    await act(async () => {
      await userEvent.click(select);
      await userEvent.click(screen.getByText('Admin'));
    });
    
    const form = screen.getByTestId('role-form');
    await act(async () => {
      await fireEvent.submit(form);
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/users/test-user/role',
        expect.objectContaining({
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role: 'Admin' })
        })
      );
    });
  });

  it('handles API error response', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: 'Invalid role' })
    });
    global.fetch = mockFetch;

    await act(async () => {
      render(<UserRoleForm userId="test-user" initialRole="Staff" />, { wrapper: TestWrapper });
    });

    const select = screen.getByTestId('role-select');
    await act(async () => {
      await userEvent.click(select);
      await userEvent.click(screen.getByText('Admin'));
    });
    
    const form = screen.getByTestId('role-form');
    await act(async () => {
      await fireEvent.submit(form);
    });

    await waitFor(() => {
      expect(screen.getByText('Error updating role')).toBeInTheDocument();
    });
  });

  it('handles network error', async () => {
    const mockFetch = jest.fn().mockRejectedValue(new Error('Network error'));
    global.fetch = mockFetch;

    await act(async () => {
      render(<UserRoleForm userId="test-user" initialRole="Staff" />, { wrapper: TestWrapper });
    });

    const select = screen.getByTestId('role-select');
    await act(async () => {
      await userEvent.click(select);
      await userEvent.click(screen.getByText('Admin'));
    });
    
    const form = screen.getByTestId('role-form');
    await act(async () => {
      await fireEvent.submit(form);
    });

    await waitFor(() => {
      expect(screen.getByText('Error updating role')).toBeInTheDocument();
    });
  });

  it('disables form submission while loading', async () => {
    const mockFetch = jest.fn().mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100)));
    global.fetch = mockFetch;

    await act(async () => {
      render(<UserRoleForm userId="test-user" initialRole="Staff" />, { wrapper: TestWrapper });
    });

    const select = screen.getByTestId('role-select');
    const submitButton = screen.getByRole('button', { name: /update/i });

    await act(async () => {
      await userEvent.click(select);
      await userEvent.click(screen.getByText('Admin'));
    });
    
    await act(async () => {
      fireEvent.click(submitButton);
    });

    expect(submitButton).toBeDisabled();
  });
}); 