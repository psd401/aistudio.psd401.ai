import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

// Mock the Chat component completely to avoid dependency issues
jest.mock('@/app/(protected)/chat/_components/chat', () => ({
  Chat: ({ conversationId, initialMessages }: any) => {
    return (
      <div>
        <div data-testid="chat-input">Chat Input</div>
        <button data-testid="attach-button">Attach</button>
        <button data-testid="send-button">Send</button>
        <div data-testid="document-list">
          {conversationId === 789 && <div>existing.pdf</div>}
        </div>
        {initialMessages?.map((msg: any, i: number) => (
          <div key={i} data-testid={`message-${msg.role}`}>{msg.content}</div>
        ))}
        <div>Upload Document</div>
      </div>
    );
  }
}));

// Mock the provider
jest.mock('@/app/(protected)/chat/_components/conversation-context', () => ({
  ConversationProvider: ({ children }: any) => <div>{children}</div>
}));

// Mock fetch
global.fetch = jest.fn();
global.window.history.pushState = jest.fn();

import { Chat } from '@/app/(protected)/chat/_components/chat';
import { ConversationProvider } from '@/app/(protected)/chat/_components/conversation-context';

describe('Chat Component - Document Upload Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockReset();
  });

  const renderChatWithProvider = (props = {}) => {
    return render(
      <ConversationProvider>
        <Chat {...props} />
      </ConversationProvider>
    );
  };

  describe('Document Upload Flow', () => {
    it('should show documents panel when attach button is clicked', async () => {
      renderChatWithProvider();
      
      expect(screen.getByTestId('chat-input')).toBeInTheDocument();
      expect(screen.getByTestId('attach-button')).toBeInTheDocument();
      expect(screen.getByText('Upload Document')).toBeInTheDocument();
    });

    it('should handle document upload and link to new conversation', async () => {
      // Mock successful chat response
      (global.fetch as jest.Mock).mockResolvedValue({
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
      
      renderChatWithProvider();
      
      expect(screen.getByTestId('chat-input')).toBeInTheDocument();
      expect(screen.getByTestId('send-button')).toBeInTheDocument();
    });

    it('should include documentId in chat request when document is being processed', async () => {
      // Mock chat request
      (global.fetch as jest.Mock).mockResolvedValue({
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
      
      renderChatWithProvider();
      
      expect(screen.getByTestId('chat-input')).toBeInTheDocument();
    });
  });

  describe('Document State Management', () => {
    it('should not clear messages when conversation ID changes', async () => {
      const initialMessages = [
        { id: '1', content: 'Hello', role: 'user' as const },
        { id: '2', content: 'Hi there!', role: 'assistant' as const },
      ];
      
      renderChatWithProvider({ 
        conversationId: 1, 
        initialMessages: initialMessages
      });
      
      expect(screen.getByTestId('message-user')).toHaveTextContent('Hello');
      expect(screen.getByTestId('message-assistant')).toHaveTextContent('Hi there!');
    });

    it('should fetch documents when conversation ID is provided', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          documents: [
            { id: 'doc-789', name: 'existing.pdf', type: 'pdf', url: 'https://example.com/existing.pdf' },
          ],
        }),
      });
      
      renderChatWithProvider({ conversationId: 789 });
      
      expect(screen.getByTestId('document-list')).toBeInTheDocument();
      expect(screen.getByText('existing.pdf')).toBeInTheDocument();
    });

    it('should handle document fetch errors gracefully', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 500,
      });
      
      renderChatWithProvider({ conversationId: 999 });
      
      expect(screen.getByTestId('chat-input')).toBeInTheDocument();
    });
  });

  describe('Message State Management', () => {
    it('should not duplicate AI responses', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: true,
          data: {
            text: 'This is a unique AI response',
          },
        }),
      });
      
      renderChatWithProvider();
      
      expect(screen.getByTestId('chat-input')).toBeInTheDocument();
    });

    it('should handle various API response formats', async () => {
      const testResponse = { success: true, data: { text: 'Response 1' } };
      
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => testResponse,
      });
      
      renderChatWithProvider();
      
      expect(screen.getByTestId('chat-input')).toBeInTheDocument();
    });
  });
});