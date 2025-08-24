'use client'

export function NexusSidebar() {
  return (
    <div className="flex h-full w-64 flex-col border-r border-border bg-background">
      <div className="p-4">
        {/* Conversation management will be implemented in future PR */}
        <div className="text-sm text-muted-foreground p-4 text-center">
          Nexus Assistant
        </div>
      </div>
    </div>
  )
}