import '@/app/globals.css';
import { Toaster } from 'sonner';
import { GlobalHeader } from '@/components/layout/global-header';
import AuthSessionProvider from "@/components/utilities/session-provider"
import { fontSans } from "@/lib/fonts"
import { cn } from "@/lib/utils"

// Environment validation is handled server-side only
// Client-side validation would expose sensitive environment variable names

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
