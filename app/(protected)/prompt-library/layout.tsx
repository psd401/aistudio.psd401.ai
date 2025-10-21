import { ReactNode } from 'react'
import { QueryProvider } from '@/components/providers/query-provider'

export default function PromptLibraryLayout({
  children
}: {
  children: ReactNode
}) {
  return <QueryProvider>{children}</QueryProvider>
}
