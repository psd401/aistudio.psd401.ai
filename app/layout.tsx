import '@/app/globals.css';
import { Toaster } from 'sonner';
import { GlobalHeader } from '@/components/layout/global-header';
import AmplifyProvider from "@/components/utilities/amplify-provider"
import { fontSans } from "@/lib/fonts"
import { cn } from "@/lib/utils"

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
        <AmplifyProvider>
          <GlobalHeader />
          {children}
          <Toaster />
        </AmplifyProvider>
      </body>
    </html>
  )
}
