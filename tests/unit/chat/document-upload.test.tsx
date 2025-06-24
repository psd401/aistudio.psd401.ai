import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { DocumentUpload } from '@/app/(protected)/chat/_components/document-upload';
import { toast } from '@/components/ui/use-toast';

// Mock the toast hook
jest.mock('@/components/ui/use-toast', () => ({
  toast: jest.fn(),
}));

// Mock fetch
global.fetch = jest.fn();

describe('DocumentUpload Component', () => {
  const mockOnUploadComplete = jest.fn();
  const mockOnFileSelected = jest.fn();
  const mockExternalInputRef = React.createRef<HTMLInputElement>();

  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockReset();
  });

  const defaultProps = {
    onUploadComplete: mockOnUploadComplete,
    onFileSelected: mockOnFileSelected,
  };

  describe('File Selection', () => {
    it('should render upload area when no file is selected', () => {
      render(<DocumentUpload {...defaultProps} />);
      
      expect(screen.getByText('Upload Document')).toBeInTheDocument();
      expect(screen.getByText(/Drag & drop or click to upload/)).toBeInTheDocument();
      expect(screen.getByText(/PDF, DOCX, TXT up to 10MB/)).toBeInTheDocument();
    });

    it('should handle file selection via click', async () => {
      const user = userEvent.setup();
      render(<DocumentUpload {...defaultProps} />);
      
      const file = new File(['test content'], 'test.pdf', { type: 'application/pdf' });
      const input = screen.getByRole('textbox', { hidden: true }) as HTMLInputElement;
      
      await user.upload(input, file);
      
      expect(mockOnFileSelected).toHaveBeenCalledWith({
        name: 'test.pdf',
        type: 'pdf',
      });
    });

    it('should reject invalid file types', async () => {
      const user = userEvent.setup();
      render(<DocumentUpload {...defaultProps} />);
      
      const file = new File(['test content'], 'test.exe', { type: 'application/exe' });
      const input = screen.getByRole('textbox', { hidden: true }) as HTMLInputElement;
      
      await user.upload(input, file);
      
      expect(toast).toHaveBeenCalledWith({
        title: 'Invalid file type',
        description: 'Please select a PDF, DOCX, or TXT file',
        variant: 'destructive',
      });
      expect(mockOnFileSelected).not.toHaveBeenCalled();
    });

    it('should reject files over 10MB', async () => {
      const user = userEvent.setup();
      render(<DocumentUpload {...defaultProps} />);
      
      // Create a file larger than 10MB
      const largeContent = new Array(11 * 1024 * 1024).fill('a').join('');
      const file = new File([largeContent], 'large.pdf', { type: 'application/pdf' });
      const input = screen.getByRole('textbox', { hidden: true }) as HTMLInputElement;
      
      await user.upload(input, file);
      
      expect(toast).toHaveBeenCalledWith({
        title: 'File too large',
        description: 'Please select a file smaller than 10MB',
        variant: 'destructive',
      });
      expect(mockOnFileSelected).not.toHaveBeenCalled();
    });
  });

  describe('Drag and Drop', () => {
    it('should handle drag and drop', async () => {
      render(<DocumentUpload {...defaultProps} />);
      
      const dropArea = screen.getByText(/Drag & drop or click to upload/).parentElement!;
      const file = new File(['test content'], 'test.pdf', { type: 'application/pdf' });
      
      // Simulate drag over
      fireEvent.dragOver(dropArea);
      expect(dropArea).toHaveClass('border-primary', 'bg-primary/5');
      
      // Simulate drop
      fireEvent.drop(dropArea, {
        dataTransfer: {
          files: [file],
        },
      });
      
      await waitFor(() => {
        expect(mockOnFileSelected).toHaveBeenCalledWith({
          name: 'test.pdf',
          type: 'pdf',
        });
      });
    });
  });

  describe('File Upload', () => {
    it('should upload file immediately when selected', async () => {
      const user = userEvent.setup();
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: true,
          document: {
            id: 'doc-123',
            name: 'test.pdf',
            type: 'pdf',
            url: 'https://s3.amazonaws.com/bucket/test.pdf',
          },
        }),
      });
      
      render(<DocumentUpload {...defaultProps} />);
      
      const file = new File(['test content'], 'test.pdf', { type: 'application/pdf' });
      const input = screen.getByRole('textbox', { hidden: true }) as HTMLInputElement;
      
      await user.upload(input, file);
      
      // Wait for upload to complete
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith('/api/documents/upload', {
          method: 'POST',
          body: expect.any(FormData),
        });
      });
      
      await waitFor(() => {
        expect(mockOnUploadComplete).toHaveBeenCalledWith({
          id: 'doc-123',
          name: 'test.pdf',
          type: 'pdf',
          url: 'https://s3.amazonaws.com/bucket/test.pdf',
        });
      });
      
      // Check success state
      expect(screen.getByText('Document processed successfully')).toBeInTheDocument();
    });

    it('should show upload progress', async () => {
      const user = userEvent.setup();
      
      // Mock fetch with a delay
      (global.fetch as jest.Mock).mockImplementation(() => 
        new Promise(resolve => 
          setTimeout(() => resolve({
            ok: true,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({
              success: true,
              document: {
                id: 'doc-123',
                name: 'test.pdf',
                type: 'pdf',
                url: 'https://s3.amazonaws.com/bucket/test.pdf',
              },
            }),
          }), 100)
        )
      );
      
      render(<DocumentUpload {...defaultProps} />);
      
      const file = new File(['test content'], 'test.pdf', { type: 'application/pdf' });
      const input = screen.getByRole('textbox', { hidden: true }) as HTMLInputElement;
      
      await user.upload(input, file);
      
      // Check that progress indicator appears
      expect(screen.getByText(/Processing document/)).toBeInTheDocument();
      
      await waitFor(() => {
        expect(screen.getByText('Document processed successfully')).toBeInTheDocument();
      });
    });

    it('should handle upload errors gracefully', async () => {
      const user = userEvent.setup();
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ error: 'Upload failed' }),
      });
      
      render(<DocumentUpload {...defaultProps} />);
      
      const file = new File(['test content'], 'test.pdf', { type: 'application/pdf' });
      const input = screen.getByRole('textbox', { hidden: true }) as HTMLInputElement;
      
      await user.upload(input, file);
      
      await waitFor(() => {
        expect(toast).toHaveBeenCalledWith({
          title: 'Upload failed',
          description: 'Upload failed',
          variant: 'destructive',
        });
      });
      
      expect(mockOnUploadComplete).not.toHaveBeenCalled();
    });
  });

  describe('Automatic Upload with Conversation ID', () => {
    it('should automatically upload when conversation ID becomes available', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: true,
          document: {
            id: 'doc-123',
            name: 'test.pdf',
            type: 'pdf',
            url: 'https://s3.amazonaws.com/bucket/test.pdf',
          },
        }),
      });
      
      const { rerender } = render(<DocumentUpload {...defaultProps} />);
      
      // Select a file first
      const file = new File(['test content'], 'test.pdf', { type: 'application/pdf' });
      const input = screen.getByRole('textbox', { hidden: true }) as HTMLInputElement;
      
      await act(async () => {
        fireEvent.change(input, { target: { files: [file] } });
      });
      
      // Initially no conversation ID, so upload happens immediately
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled();
      });
    });
  });

  describe('Cancel and Upload Another', () => {
    it('should allow cancelling file selection', async () => {
      const user = userEvent.setup();
      render(<DocumentUpload {...defaultProps} />);
      
      const file = new File(['test content'], 'test.pdf', { type: 'application/pdf' });
      const input = screen.getByRole('textbox', { hidden: true }) as HTMLInputElement;
      
      await user.upload(input, file);
      
      // Find and click cancel button
      const cancelButton = screen.getByRole('button', { name: '' }); // X button
      await user.click(cancelButton);
      
      // Should go back to initial state
      expect(screen.getByText(/Drag & drop or click to upload/)).toBeInTheDocument();
    });

    it('should allow uploading another file after completion', async () => {
      const user = userEvent.setup();
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: true,
          document: {
            id: 'doc-123',
            name: 'test.pdf',
            type: 'pdf',
            url: 'https://s3.amazonaws.com/bucket/test.pdf',
          },
        }),
      });
      
      render(<DocumentUpload {...defaultProps} />);
      
      const file = new File(['test content'], 'test.pdf', { type: 'application/pdf' });
      const input = screen.getByRole('textbox', { hidden: true }) as HTMLInputElement;
      
      await user.upload(input, file);
      
      await waitFor(() => {
        expect(screen.getByText('Document processed successfully')).toBeInTheDocument();
      });
      
      // Click upload another
      const uploadAnotherButton = screen.getByText('Upload Another');
      await user.click(uploadAnotherButton);
      
      // Should reset to initial state
      await waitFor(() => {
        expect(screen.queryByText('Document processed successfully')).not.toBeInTheDocument();
      });
    });
  });

  describe('Pending Document State', () => {
    it('should display pending document when provided', () => {
      const pendingDoc = {
        id: 'pending-123',
        name: 'pending.pdf',
        type: 'pdf',
      };
      
      render(
        <DocumentUpload 
          {...defaultProps} 
          pendingDocument={pendingDoc}
        />
      );
      
      expect(screen.getByText('pending.pdf')).toBeInTheDocument();
      expect(screen.getByText('Processed. Ready for chat.')).toBeInTheDocument();
    });

    it('should show waiting message when no conversation ID and no pending document ID', () => {
      const pendingDoc = {
        name: 'pending.pdf',
        type: 'pdf',
      };
      
      render(
        <DocumentUpload 
          {...defaultProps} 
          pendingDocument={pendingDoc}
        />
      );
      
      expect(screen.getByText('The document will be uploaded when you start a conversation')).toBeInTheDocument();
    });
  });
});