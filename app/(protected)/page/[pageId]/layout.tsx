import { NavbarNested } from "@/components/navigation/navbar-nested"

export default function PublicPageLayout({
  children
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen pt-14">
      <NavbarNested />
      <main className="flex-1 lg:pl-[68px] bg-white min-h-[calc(100vh-3.5rem)]">
        <div className="p-4 sm:p-6 md:p-8">
          {children}
        </div>
      </main>
    </div>
  )
} 