import { MantineProvider } from '@mantine/core';
import { ReactNode } from 'react';

export function TestWrapper({ children }: { children: ReactNode }) {
  return (
    <MantineProvider>
      {children}
    </MantineProvider>
  );
} 