import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'

// Mock the entire dropdown-menu UI component to avoid displayName issues
jest.mock('@/components/ui/dropdown-menu', () => {
  const React = require('react');
  
  const createComponent = (name: string) => {
    const Component = ({ children, ...props }: any) => 
      React.createElement('div', { ...props, 'data-testid': name.toLowerCase() }, children);
    Component.displayName = name;
    return Component;
  };
  
  return {
    DropdownMenu: createComponent('DropdownMenu'),
    DropdownMenuTrigger: createComponent('DropdownMenuTrigger'),
    DropdownMenuContent: createComponent('DropdownMenuContent'),
    DropdownMenuItem: createComponent('DropdownMenuItem'),
    DropdownMenuCheckboxItem: createComponent('DropdownMenuCheckboxItem'),
    DropdownMenuRadioItem: createComponent('DropdownMenuRadioItem'),
    DropdownMenuLabel: createComponent('DropdownMenuLabel'),
    DropdownMenuSeparator: createComponent('DropdownMenuSeparator'),
    DropdownMenuShortcut: createComponent('DropdownMenuShortcut'),
    DropdownMenuGroup: createComponent('DropdownMenuGroup'),
    DropdownMenuPortal: createComponent('DropdownMenuPortal'),
    DropdownMenuSub: createComponent('DropdownMenuSub'),
    DropdownMenuSubContent: createComponent('DropdownMenuSubContent'),
    DropdownMenuSubTrigger: createComponent('DropdownMenuSubTrigger'),
    DropdownMenuRadioGroup: createComponent('DropdownMenuRadioGroup')
  }
})

// Mock the tabs UI component to avoid displayName issues
jest.mock('@/components/ui/tabs', () => {
  const React = require('react');
  
  const createComponent = (name: string) => {
    const Component = ({ children, ...props }: any) => 
      React.createElement('div', { ...props, 'data-testid': name.toLowerCase() }, children);
    Component.displayName = name;
    return Component;
  };
  
  return {
    Tabs: createComponent('Tabs'),
    TabsList: createComponent('TabsList'),
    TabsTrigger: createComponent('TabsTrigger'),
    TabsContent: createComponent('TabsContent')
  }
})

// Mock Alert Dialog
jest.mock('@radix-ui/react-alert-dialog', () => {
  const mockComponent = (name: string) => {
    const MockedComponent = ({ children, ...props }: any) => <div {...props}>{children}</div>
    MockedComponent.displayName = name
    return MockedComponent
  }
  
  return {
    __esModule: true,
    Root: mockComponent('AlertDialogRoot'),
    Trigger: mockComponent('AlertDialogTrigger'),
    Portal: mockComponent('AlertDialogPortal'),
    Overlay: mockComponent('AlertDialogOverlay'),
    Content: mockComponent('AlertDialogContent'),
    Title: mockComponent('AlertDialogTitle'),
    Description: mockComponent('AlertDialogDescription'),
    Action: mockComponent('AlertDialogAction'),
    Cancel: mockComponent('AlertDialogCancel')
  }
})

// Mock form components
jest.mock('@/components/ui/form', () => {
  const React = require('react');
  
  const createFormComponent = (name: string) => {
    const Component = ({ children, ...props }: any) => 
      React.createElement('div', { ...props, 'data-testid': name.toLowerCase() }, children);
    Component.displayName = name;
    return Component;
  };
  
  return {
    Form: createFormComponent('Form'),
    FormControl: createFormComponent('FormControl'),
    FormField: createFormComponent('FormField'),
    FormItem: createFormComponent('FormItem'),
    FormLabel: createFormComponent('FormLabel'),
    FormMessage: createFormComponent('FormMessage'),
    FormDescription: createFormComponent('FormDescription'),
    useFormField: () => ({
      id: 'mock-form-field',
      name: 'mock-field',
      formItemId: 'mock-form-item',
      formDescriptionId: 'mock-form-description',
      formMessageId: 'mock-form-message'
    })
  }
})

// Mock the toast hook
jest.mock('@/components/ui/use-toast', () => ({
  useToast: () => ({
    toast: jest.fn()
  })
}))

// Mock fetch
global.fetch = jest.fn()

// Import component after mocks are set up
import { SettingsClient } from './settings-client'

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