import '@/app/globals.css';
import { ClerkProvider } from '@clerk/nextjs';
import { NavbarNested } from '@/components/navigation/navbar-nested';
import { auth } from '@clerk/nextjs/server';
import { Toaster } from 'sonner';

export const metadata = {
  title: 'PSD AI Tools',
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
          <meta
            httpEquiv="Content-Security-Policy"
            content="script-src 'self' 'unsafe-inline' 'unsafe-eval' https://clerk.psd401.ai https://*.clerk.accounts.dev https://va.vercel-scripts.com; worker-src 'self' blob:;"
          />
        </head>
        <body suppressHydrationWarning>
          <Toaster />
          {userId ? (
            <div className="flex min-h-screen">
              <NavbarNested />
              <main className="flex-1 p-4">
                {children}
              </main>
            </div>
          ) : (
            children
          )}
        </body>
      </html>
    </ClerkProvider>
  );
}
