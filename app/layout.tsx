import { ClerkProvider } from '@clerk/nextjs';
import { ColorSchemeScript, MantineProvider } from '@mantine/core';
import '@mantine/core/styles.css';
import './globals.css';
import { NavBar } from '~/components/NavBar';

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
    <html lang="en">
      <head>
        <ColorSchemeScript />
      </head>
      <body>
        <ClerkProvider>
          <MantineProvider>
            <NavBar />
            <main className="p-4">
              {children}
            </main>
          </MantineProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
