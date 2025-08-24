'use client'

export function NexusHeader() {
  return (
    <header className="border-b border-border bg-background px-4 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-foreground">
            Nexus
          </h1>
          <div className="rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-700 dark:bg-blue-900 dark:text-blue-300">
            Preview
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Model selector and other controls will go here */}
        </div>
      </div>
    </header>
  )
}