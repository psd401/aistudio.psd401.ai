import { NavbarNested } from "@/components/navigation/navbar-nested"

export default function DashboardLayout({
  children
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen pt-14">
      <NavbarNested />
      <main className="flex-1 lg:pl-[68px]">
        <div className="bg-muted/40 p-4 sm:p-6 md:p-8">
          {children}
        </div>
      </main>
    </div>
  )
} 