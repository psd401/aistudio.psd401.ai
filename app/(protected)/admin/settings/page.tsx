"use server"

import { Suspense } from "react"
import { SettingsClient } from "./_components/settings-client"
import { requireRole } from "@/lib/auth/role-helpers"
import { getSettingsAction } from "@/actions/db/settings-actions"
import { Skeleton } from "@/components/ui/skeleton"

export default async function SettingsPage() {
  await requireRole("administrator")
  
  // Fetch settings from the database
  const settingsResult = await getSettingsAction()
  const settings = settingsResult.isSuccess ? settingsResult.data : []
  
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">System Settings</h1>
        <p className="text-muted-foreground mt-1">
          Manage API keys and configuration values for the application
        </p>
      </div>
      
      <Suspense fallback={<SettingsSkeleton />}>
        <SettingsClient initialSettings={settings} />
      </Suspense>
    </div>
  )
}

function SettingsSkeleton() {
  return (
    <div className="space-y-6">
      {/* Category skeleton */}
      {[1, 2, 3].map((i) => (
        <div key={i} className="space-y-4">
          <Skeleton className="h-8 w-48" />
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        </div>
      ))}
    </div>
  )
}