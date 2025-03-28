"use server"

import { NavigationManager } from "./_components/navigation-manager"

export default async function NavigationPage() {
  return (
    <div className="container mx-auto py-6">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Navigation Management</h1>
          <p className="text-muted-foreground mt-2">
            Manage the navigation structure of your application.
          </p>
        </div>
      </div>
      <NavigationManager />
    </div>
  )
} 