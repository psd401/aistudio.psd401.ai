import StandardPageLayout from "@/components/layouts/standard-page-layout"

export default function DashboardLayout({
  children
}: {
  children: React.ReactNode
}) {
  return <StandardPageLayout>{children}</StandardPageLayout>
} 