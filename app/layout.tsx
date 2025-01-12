import { ClerkProvider } from '@clerk/nextjs';
import { ColorSchemeScript } from '@mantine/core';
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import './globals.css';
import { AuthenticatedNavBar } from '~/components/AuthenticatedNavBar';
import { MantineClientProvider } from '~/components/MantineClientProvider';

export const metadata = {
  title: 'Enterprise App Template',
  description: 'Next.js 14+ Enterprise Template with Clerk, Drizzle, and Mantine',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <ColorSchemeScript defaultColorScheme="light" />
      </head>
      <body suppressHydrationWarning>
        <ClerkProvider>
          <MantineClientProvider>
            <AuthenticatedNavBar />
            <main className="p-4">
              {children}
            </main>
          </MantineClientProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
