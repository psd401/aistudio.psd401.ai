import '@/app/globals.css';
import { ClerkProvider } from '@clerk/nextjs';
import { Toaster } from 'sonner';
import { GlobalHeader } from '@/components/layout/global-header';
import AuthLayoutContent from '@/components/layout/auth-layout-content';

export const metadata = {
  title: 'PSD AI Studio',
  description: 'A creative space for building, exploring, and innovating with AI in education',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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
          <GlobalHeader />
          <AuthLayoutContent>
            {children}
          </AuthLayoutContent>
        </body>
      </html>
    </ClerkProvider>
  );
}
