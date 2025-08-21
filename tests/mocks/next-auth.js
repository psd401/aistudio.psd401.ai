// Mock next-auth/react for testing
const React = require('react');

// Mock signIn function
const signIn = jest.fn().mockResolvedValue({ ok: true, url: '/dashboard' });

// Mock signOut function  
const signOut = jest.fn().mockResolvedValue(undefined);

// Mock useSession hook
const useSession = jest.fn().mockReturnValue({
  data: {
    user: {
      id: '1',
      email: 'test@example.com',
      name: 'Test User'
    }
  },
  status: 'authenticated'
});

// Mock SessionProvider
const SessionProvider = ({ children }) => React.createElement('div', {}, children);

module.exports = {
  signIn,
  signOut,
  useSession,
  SessionProvider
};