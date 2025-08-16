import StandardPageLayout from "@/components/layouts/standard-page-layout"

export default async function AssistantArchitectLayout({
  children
}: {
  children: React.ReactNode
}) {
  return <StandardPageLayout>{children}</StandardPageLayout>
} 