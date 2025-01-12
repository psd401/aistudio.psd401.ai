import '@mantine/core/styles.css';
import { ClerkProvider } from '@clerk/nextjs';
import { ColorSchemeScript } from '@mantine/core';
import { MantineClientProvider } from '../components/MantineClientProvider';
import { NavbarNested } from '../components/NavbarNested';
import { Group } from '@mantine/core';
import { auth } from '@clerk/nextjs/server';

export const metadata = {
  title: 'PSD401.AI',
  description: 'AI Tools for PSD401',
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId } = await auth();

  return (
    <ClerkProvider>
      <html lang="en" suppressHydrationWarning>
        <head>
          <ColorSchemeScript defaultColorScheme="light" />
        </head>
        <body suppressHydrationWarning>
          <MantineClientProvider>
            {userId ? (
              <Group align="flex-start" wrap="nowrap">
                <NavbarNested />
                <main style={{ flex: 1, padding: 'var(--mantine-spacing-md)' }}>
                  {children}
                </main>
              </Group>
            ) : (
              children
            )}
          </MantineClientProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
