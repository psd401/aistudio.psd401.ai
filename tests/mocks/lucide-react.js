// Mock for lucide-react icons
const React = require('react');

module.exports = {
  Loader2: () => React.createElement('div', { className: 'mock-loader2' }),
  Info: () => React.createElement('div', { className: 'mock-info' }),
  AlertCircle: () => React.createElement('div', { className: 'mock-alert-circle' }),
  CheckCircle2: () => React.createElement('div', { className: 'mock-check-circle2' }),
  XCircle: () => React.createElement('div', { className: 'mock-x-circle' }),
  // Add other icons as needed
};