// Mock for @/components/ui/scroll-area
const React = require('react');

const ScrollArea = React.forwardRef(({ children, className, ...props }, ref) => 
  React.createElement('div', { 
    ...props, 
    ref, 
    className,
    'data-testid': 'scroll-area' 
  }, children)
);
ScrollArea.displayName = 'ScrollArea';

const ScrollBar = React.forwardRef(({ className, orientation = "vertical", ...props }, ref) => 
  React.createElement('div', { 
    ...props, 
    ref,
    className, 
    'data-testid': 'scroll-bar',
    'data-orientation': orientation
  })
);
ScrollBar.displayName = 'ScrollBar';

module.exports = {
  ScrollArea,
  ScrollBar
};