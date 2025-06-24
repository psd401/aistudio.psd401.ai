import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { SettingsClient } from './settings-client'
import '@testing-library/jest-dom'

// Mock the toast hook
jest.mock('@/components/ui/use-toast', () => ({
  useToast: () => ({
    toast: jest.fn()
  })
}))

// Mock fetch
global.fetch = jest.fn()

describe('SettingsClient', () => {
  const mockSettings = [
    {
      id: 1,
      key: 'TEST_KEY',
      value: 'test_value',
      description: 'Test description',
      category: 'test',
      isSecret: false,
      hasValue: true,
      createdAt: new Date(),
      updatedAt: new Date()
    }
  ]

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should close the modal after successful save', async () => {
    // Mock successful API response
    ;(fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        isSuccess: true,
        data: {
          id: 2,
          key: 'NEW_KEY',
          value: 'new_value',
          description: 'New description',
          category: 'test',
          isSecret: false,
          hasValue: true,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      })
    })

    render(<SettingsClient initialSettings={mockSettings} />)

    // Open the form
    const addButton = screen.getByText('Add Setting')
    fireEvent.click(addButton)

    // Check that dialog is open
    await waitFor(() => {
      expect(screen.getByText('Add Setting')).toBeInTheDocument()
    })

    // Fill the form
    const keyInput = screen.getByPlaceholderText('SETTING_KEY')
    fireEvent.change(keyInput, { target: { value: 'NEW_KEY' } })

    const valueTextarea = screen.getByPlaceholderText('Enter the setting value')
    fireEvent.change(valueTextarea, { target: { value: 'new_value' } })

    // Submit the form
    const createButton = screen.getByText('Create')
    fireEvent.click(createButton)

    // Wait for the modal to close
    await waitFor(() => {
      // The dialog should be closed, so the form title should not be visible
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    // Verify the API was called
    expect(fetch).toHaveBeenCalledWith('/api/admin/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key: 'NEW_KEY',
        value: 'new_value',
        description: null,
        category: null,
        isSecret: false
      })
    })
  })

  it('should keep the modal open on save error', async () => {
    // Mock failed API response
    ;(fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        isSuccess: false,
        message: 'Save failed'
      })
    })

    render(<SettingsClient initialSettings={mockSettings} />)

    // Open the form
    const addButton = screen.getByText('Add Setting')
    fireEvent.click(addButton)

    // Check that dialog is open
    await waitFor(() => {
      expect(screen.getByText('Add Setting')).toBeInTheDocument()
    })

    // Fill the form
    const keyInput = screen.getByPlaceholderText('SETTING_KEY')
    fireEvent.change(keyInput, { target: { value: 'NEW_KEY' } })

    // Submit the form
    const createButton = screen.getByText('Create')
    fireEvent.click(createButton)

    // Wait and verify the modal is still open
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    // The button should return to its normal state
    await waitFor(() => {
      expect(screen.getByText('Create')).toBeInTheDocument()
    })
  })
})