import { Suspense } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { AssistantsTable } from "./_components/assistants-table"

export default async function AssistantsPage() {
  return (
    <div className="container mx-auto px-6 py-8">
      <Card>
        <CardHeader>
          <CardTitle>AI Assistants</CardTitle>
          <CardDescription>
            Manage AI assistants created with the Assistant Architect
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<AssistantsTableSkeleton />}>
            <AssistantsTableContent />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  )
}

async function AssistantsTableContent() {
  return <AssistantsTable />
}

function AssistantsTableSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-10 w-[300px]" />
        <Skeleton className="h-10 w-[120px]" />
      </div>
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    </div>
  )
} 