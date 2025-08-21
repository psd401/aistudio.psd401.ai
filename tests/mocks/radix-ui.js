// Mock Radix UI components for testing
const React = require('react');

// Mock Select components
const Select = ({ children, ...props }) => React.createElement('div', { ...props, 'data-testid': 'select' }, children);
const SelectTrigger = ({ children, ...props }) => React.createElement('button', { ...props, 'data-testid': 'select-trigger' }, children);
const SelectContent = ({ children, ...props }) => React.createElement('div', { ...props, 'data-testid': 'select-content' }, children);
const SelectItem = ({ children, ...props }) => React.createElement('div', { ...props, 'data-testid': 'select-item' }, children);
const SelectValue = ({ children, placeholder, ...props }) => React.createElement('span', { ...props, 'data-testid': 'select-value' }, children || placeholder);

// Mock Dialog components
const Dialog = ({ children, ...props }) => React.createElement('div', { ...props, 'data-testid': 'dialog' }, children);
const DialogTrigger = ({ children, ...props }) => React.createElement('button', { ...props, 'data-testid': 'dialog-trigger' }, children);
const DialogContent = ({ children, ...props }) => React.createElement('div', { ...props, 'data-testid': 'dialog-content' }, children);
const DialogHeader = ({ children, ...props }) => React.createElement('div', { ...props, 'data-testid': 'dialog-header' }, children);
const DialogTitle = ({ children, ...props }) => React.createElement('h2', { ...props, 'data-testid': 'dialog-title' }, children);
const DialogDescription = ({ children, ...props }) => React.createElement('p', { ...props, 'data-testid': 'dialog-description' }, children);

// Mock Label
const Label = ({ children, ...props }) => React.createElement('label', { ...props, 'data-testid': 'label' }, children);

// Mock Button
const Button = React.forwardRef(({ children, ...props }, ref) => 
  React.createElement('button', { ...props, ref, 'data-testid': 'button' }, children)
);
Button.displayName = 'Button';

// Mock Input
const Input = React.forwardRef((props, ref) => 
  React.createElement('input', { ...props, ref, 'data-testid': 'input' })
);
Input.displayName = 'Input';

// Mock Card components
const Card = ({ children, ...props }) => React.createElement('div', { ...props, 'data-testid': 'card' }, children);
const CardHeader = ({ children, ...props }) => React.createElement('div', { ...props, 'data-testid': 'card-header' }, children);
const CardTitle = ({ children, ...props }) => React.createElement('h3', { ...props, 'data-testid': 'card-title' }, children);
const CardDescription = ({ children, ...props }) => React.createElement('p', { ...props, 'data-testid': 'card-description' }, children);
const CardContent = ({ children, ...props }) => React.createElement('div', { ...props, 'data-testid': 'card-content' }, children);
const CardFooter = ({ children, ...props }) => React.createElement('div', { ...props, 'data-testid': 'card-footer' }, children);

// Mock Tabs components
const Tabs = ({ children, ...props }) => React.createElement('div', { ...props, 'data-testid': 'tabs' }, children);
const TabsList = ({ children, ...props }) => React.createElement('div', { ...props, 'data-testid': 'tabs-list' }, children);
const TabsTrigger = ({ children, ...props }) => React.createElement('button', { ...props, 'data-testid': 'tabs-trigger' }, children);
const TabsContent = ({ children, ...props }) => React.createElement('div', { ...props, 'data-testid': 'tabs-content' }, children);

// Mock Badge component
const Badge = ({ children, ...props }) => React.createElement('span', { ...props, 'data-testid': 'badge' }, children);

module.exports = {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  Label,
  Button,
  Input,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Badge
};