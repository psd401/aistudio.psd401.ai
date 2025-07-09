import '@/app/globals.css';
import { Toaster } from 'sonner';
import { GlobalHeader } from '@/components/layout/global-header';
import AuthSessionProvider from "@/components/utilities/session-provider"
import { fontSans } from "@/lib/fonts"
import { cn } from "@/lib/utils"
import { validateEnv } from "@/lib/env-validation";
import logger from "@/lib/logger";

// Validate environment variables on app startup
if (process.env.NODE_ENV === 'production') {
  const { isValid, missing, warnings } = validateEnv();
  if (!isValid) {
    logger.error('CRITICAL: Missing required environment variables:', missing);
    // In production, we log but don't throw to avoid breaking the app
    // The individual services will handle missing env vars appropriately
  }
  if (warnings.length > 0) {
    logger.warn('Environment validation warnings:', warnings);
  }
}

export const metadata = {
  title: 'AI Studio',
  description: 'Next-gen AI for education',
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head />
      <body
        className={cn(
          "min-h-screen bg-background font-sans antialiased",
          fontSans.variable
        )}
        suppressHydrationWarning
      >
        <AuthSessionProvider>
          <GlobalHeader />
          {children}
          <Toaster />
        </AuthSessionProvider>
      </body>
    </html>
  )
}
