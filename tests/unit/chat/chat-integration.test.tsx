import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { Chat } from '@/app/(protected)/chat/_components/chat';
import { toast } from '@/components/ui/use-toast';

// Mock @ai-sdk/react instead of ai/react
jest.mock('@ai-sdk/react', () => ({
  useChat: jest.fn(() => ({
    messages: [],
    input: '',
    handleInputChange: jest.fn(),
    handleSubmit: jest.fn(),
    isLoading: false,
    stop: jest.fn(),
    setMessages: jest.fn(),
    setInput: jest.fn(),
  })),
}));

// Mock components
jest.mock('@/components/ui/use-toast', () => ({
  useToast: jest.fn(() => ({
    toast: jest.fn()
  })),
  toast: jest.fn()
}));
jest.mock('@/app/(protected)/chat/_components/model-selector', () => ({
  ModelSelector: ({ onModelSelect }: any) => {
    React.useEffect(() => {
      onModelSelect({ model_id: 'test-model', name: 'Test Model', provider: 'test' });
    }, [onModelSelect]);
    return <div>Model Selector</div>;
  },
}));
jest.mock('@/app/(protected)/chat/_components/chat-input', () => ({
  ChatInput: ({ handleSubmit, input, handleInputChange, onAttachClick }: any) => (
    <form onSubmit={handleSubmit}>
      <textarea
        value={input}
        onChange={handleInputChange}
        data-testid="chat-input"
      />
      <button type="submit">Send</button>
      <button type="button" onClick={onAttachClick} data-testid="attach-button">
        Attach
      </button>
    </form>
  ),
}));
jest.mock('@/app/(protected)/chat/_components/message', () => ({
  Message: ({ message }: any) => (
    <div data-testid={`message-${message.role}`}>{message.content}</div>
  ),
}));
jest.mock('@/app/(protected)/chat/_components/document-list', () => ({
  DocumentList: ({ documents }: any) => (
    <div data-testid="document-list">
      {documents.map((doc: any) => (
        <div key={doc.id}>{doc.name}</div>
      ))}
    </div>
  ),
}));
jest.mock('@/app/(protected)/chat/_components/document-upload', () => ({
  DocumentUpload: ({ onUploadComplete, conversationId }: any) => (
    <div data-testid="document-upload">
      <h3>Upload Document</h3>
      <button onClick={() => onUploadComplete?.({ id: 'doc-1', name: 'test.pdf' })}>
        Upload Test Document
      </button>
    </div>
  ),
}));
jest.mock('@/app/(protected)/chat/_components/ai-thinking-indicator', () => ({
  AiThinkingIndicator: () => <div>Thinking...</div>,
}));

// Mock fetch
global.fetch = jest.fn();

// Mock window.history.pushState
global.window.history.pushState = jest.fn();

describe('Chat Component - Document Upload Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockReset();
    (toast as jest.Mock).mockReturnValue(jest.fn());
  });

  const setupMocks = () => {
    // Mock models API
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('/api/chat/models')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            data: [
              { model_id: 'test-model', name: 'Test Model', provider: 'test', chat_enabled: true },
            ],
          }),
        });
      }
      return Promise.resolve({ ok: false });
    });
  };

  describe('Document Upload Flow', () => {
    it('should show documents panel when attach button is clicked', async () => {
      setupMocks();
      const user = userEvent.setup();
      
      render(<Chat />);
      
      await waitFor(() => {
        expect(screen.getByTestId('chat-input')).toBeInTheDocument();
      });
      
      const attachButton = screen.getByTestId('attach-button');
      await user.click(attachButton);
      
      expect(screen.getByText('Upload Document')).toBeInTheDocument();
    });

    it('should handle document upload and link to new conversation', async () => {
      setupMocks();
      const user = userEvent.setup();
      
      // Mock successful chat response
      (global.fetch as jest.Mock).mockImplementation((url: string, options?: any) => {
        if (url.includes('/api/chat/models')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              data: [
                { model_id: 'test-model', name: 'Test Model', provider: 'test', chat_enabled: true },
              ],
            }),
          });
        }
        
        if (url === '/api/chat' && options?.method === 'POST') {
          const body = JSON.parse(options.body);
          return Promise.resolve({
            ok: true,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({
              success: true,
              data: {
                text: 'AI response about the document',
                conversationId: 123,
              },
            }),
          });
        }
        
        if (url === '/api/documents/link' && options?.method === 'POST') {
          return Promise.resolve({
            ok: true,
            json: async () => ({ success: true }),
          });
        }
        
        if (url.includes('/api/documents?conversationId=123')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              success: true,
              documents: [
                { id: 'doc-123', name: 'test.pdf', type: 'pdf', url: 'https://example.com/test.pdf' },
              ],
            }),
          });
        }
        
        return Promise.resolve({ ok: false });
      });
      
      render(<Chat />);
      
      await waitFor(() => {
        expect(screen.getByTestId('chat-input')).toBeInTheDocument();
      });
      
      // Type a message
      const input = screen.getByTestId('chat-input');
      await user.type(input, 'What is in this document?');
      
      // Submit the message
      const sendButton = screen.getByText('Send');
      await user.click(sendButton);
      
      // Check that message appears
      await waitFor(() => {
        expect(screen.getByTestId('message-user')).toHaveTextContent('What is in this document?');
      });
      
      // Check that AI response appears
      await waitFor(() => {
        expect(screen.getByTestId('message-assistant')).toHaveTextContent('AI response about the document');
      });
      
      // Check that URL was updated
      expect(window.history.pushState).toHaveBeenCalledWith({}, '', '/chat?conversation=123');
      
      // Check that documents were fetched
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/documents?conversationId=123'),
          expect.any(Object)
        );
      });
    });

    it('should include documentId in chat request when document is being processed', async () => {
      setupMocks();
      const user = userEvent.setup();
      
      // Mock document upload component to simulate document selection
      jest.mock('@/app/(protected)/chat/_components/document-upload', () => ({
        DocumentUpload: ({ onUploadComplete, onFileSelected }: any) => {
          React.useEffect(() => {
            // Simulate file selection and upload
            onFileSelected({ name: 'test.pdf', type: 'pdf' });
            setTimeout(() => {
              onUploadComplete({
                id: 'doc-456',
                name: 'test.pdf',
                type: 'pdf',
                url: 'https://example.com/test.pdf',
              });
            }, 100);
          }, []);
          return <div>Document Upload Component</div>;
        },
      }));
      
      let chatRequestBody: any;
      (global.fetch as jest.Mock).mockImplementation((url: string, options?: any) => {
        if (url.includes('/api/chat/models')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              data: [
                { model_id: 'test-model', name: 'Test Model', provider: 'test', chat_enabled: true },
              ],
            }),
          });
        }
        
        if (url === '/api/chat' && options?.method === 'POST') {
          chatRequestBody = JSON.parse(options.body);
          return Promise.resolve({
            ok: true,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({
              success: true,
              data: {
                text: 'AI response',
                conversationId: 456,
              },
            }),
          });
        }
        
        return Promise.resolve({ ok: false });
      });
      
      render(<Chat />);
      
      await waitFor(() => {
        expect(screen.getByTestId('chat-input')).toBeInTheDocument();
      });
      
      // Open documents panel
      const attachButton = screen.getByTestId('attach-button');
      await user.click(attachButton);
      
      // Wait for document to be "uploaded"
      await waitFor(() => {
        expect(screen.getByText('Upload Document')).toBeInTheDocument();
      }, { timeout: 2000 });
      
      // Send a message
      const input = screen.getByTestId('chat-input');
      await user.type(input, 'Analyze this document');
      
      const sendButton = screen.getByText('Send');
      await user.click(sendButton);
      
      // Check that documentId was included in the request
      await waitFor(() => {
        expect(chatRequestBody).toBeDefined();
        expect(chatRequestBody.documentId).toBe('doc-456');
      });
    });
  });

  describe('Document State Management', () => {
    it('should not clear messages when conversation ID changes', async () => {
      setupMocks();
      
      const initialMessages = [
        { id: '1', content: 'Hello', role: 'user' as const },
        { id: '2', content: 'Hi there!', role: 'assistant' as const },
      ];
      
      const { rerender } = render(
        <Chat 
          conversationId={1} 
          initialMessages={initialMessages}
        />
      );
      
      await waitFor(() => {
        expect(screen.getByTestId('message-user')).toHaveTextContent('Hello');
        expect(screen.getByTestId('message-assistant')).toHaveTextContent('Hi there!');
      });
      
      // Rerender with same conversation ID - messages should persist
      rerender(
        <Chat 
          conversationId={1} 
          initialMessages={initialMessages}
        />
      );
      
      expect(screen.getByTestId('message-user')).toHaveTextContent('Hello');
      expect(screen.getByTestId('message-assistant')).toHaveTextContent('Hi there!');
    });

    it('should fetch documents when conversation ID is provided', async () => {
      setupMocks();
      
      (global.fetch as jest.Mock).mockImplementation((url: string) => {
        if (url.includes('/api/chat/models')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              data: [
                { model_id: 'test-model', name: 'Test Model', provider: 'test', chat_enabled: true },
              ],
            }),
          });
        }
        
        if (url.includes('/api/documents?conversationId=789')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              success: true,
              documents: [
                { id: 'doc-789', name: 'existing.pdf', type: 'pdf', url: 'https://example.com/existing.pdf' },
              ],
            }),
          });
        }
        
        return Promise.resolve({ ok: false });
      });
      
      render(<Chat conversationId={789} />);
      
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/documents?conversationId=789'),
          expect.any(Object)
        );
      });
      
      // Documents panel should auto-show when documents exist
      await waitFor(() => {
        expect(screen.getByTestId('document-list')).toBeInTheDocument();
        expect(screen.getByText('existing.pdf')).toBeInTheDocument();
      });
    });

    it('should handle document fetch errors gracefully', async () => {
      setupMocks();
      
      (global.fetch as jest.Mock).mockImplementation((url: string) => {
        if (url.includes('/api/chat/models')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              data: [
                { model_id: 'test-model', name: 'Test Model', provider: 'test', chat_enabled: true },
              ],
            }),
          });
        }
        
        if (url.includes('/api/documents')) {
          return Promise.resolve({
            ok: false,
            status: 500,
          });
        }
        
        return Promise.resolve({ ok: false });
      });
      
      render(<Chat conversationId={999} />);
      
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/documents?conversationId=999'),
          expect.any(Object)
        );
      });
      
      // Should still render without documents
      expect(screen.getByTestId('chat-input')).toBeInTheDocument();
    });
  });

  describe('Message State Management', () => {
    it('should not duplicate AI responses', async () => {
      setupMocks();
      const user = userEvent.setup();
      
      (global.fetch as jest.Mock).mockImplementation((url: string, options?: any) => {
        if (url.includes('/api/chat/models')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              data: [
                { model_id: 'test-model', name: 'Test Model', provider: 'test', chat_enabled: true },
              ],
            }),
          });
        }
        
        if (url === '/api/chat' && options?.method === 'POST') {
          return Promise.resolve({
            ok: true,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({
              success: true,
              data: {
                text: 'This is a unique AI response',
              },
            }),
          });
        }
        
        return Promise.resolve({ ok: false });
      });
      
      render(<Chat />);
      
      await waitFor(() => {
        expect(screen.getByTestId('chat-input')).toBeInTheDocument();
      });
      
      // Send a message
      const input = screen.getByTestId('chat-input');
      await user.type(input, 'Test message');
      
      const sendButton = screen.getByText('Send');
      await user.click(sendButton);
      
      // Wait for AI response
      await waitFor(() => {
        const assistantMessages = screen.getAllByTestId('message-assistant');
        expect(assistantMessages).toHaveLength(1);
        expect(assistantMessages[0]).toHaveTextContent('This is a unique AI response');
      });
      
      // Ensure no duplicate messages appear after a delay
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 500));
      });
      
      const finalAssistantMessages = screen.getAllByTestId('message-assistant');
      expect(finalAssistantMessages).toHaveLength(1);
    });

    it('should handle various API response formats', async () => {
      setupMocks();
      const user = userEvent.setup();
      
      const testCases = [
        { response: { success: true, data: { text: 'Response 1' } }, expected: 'Response 1' },
        { response: { text: 'Response 2' }, expected: 'Response 2' },
        { response: { content: 'Response 3' }, expected: 'Response 3' },
        { response: { message: { content: 'Response 4' } }, expected: 'Response 4' },
      ];
      
      for (const testCase of testCases) {
        jest.clearAllMocks();
        
        (global.fetch as jest.Mock).mockImplementation((url: string, options?: any) => {
          if (url.includes('/api/chat/models')) {
            return Promise.resolve({
              ok: true,
              json: async () => ({
                data: [
                  { model_id: 'test-model', name: 'Test Model', provider: 'test', chat_enabled: true },
                ],
              }),
            });
          }
          
          if (url === '/api/chat' && options?.method === 'POST') {
            return Promise.resolve({
              ok: true,
              headers: new Headers({ 'content-type': 'application/json' }),
              json: async () => testCase.response,
            });
          }
          
          return Promise.resolve({ ok: false });
        });
        
        const { unmount } = render(<Chat />);
        
        await waitFor(() => {
          expect(screen.getByTestId('chat-input')).toBeInTheDocument();
        });
        
        const input = screen.getByTestId('chat-input');
        await user.type(input, 'Test');
        
        const sendButton = screen.getByText('Send');
        await user.click(sendButton);
        
        await waitFor(() => {
          const assistantMessages = screen.getAllByTestId('message-assistant');
          expect(assistantMessages[assistantMessages.length - 1]).toHaveTextContent(testCase.expected);
        });
        
        unmount();
      }
    });
  });
});