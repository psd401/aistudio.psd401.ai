"use server"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default async function PoliticalWordingPage() {
  return (
    <div className="section-container">
      <div className="page-header">
        <h1 className="text-2xl font-semibold tracking-tight">Political Wording Evaluator</h1>
        <p className="text-muted-foreground">
          Analyze text across the political spectrum to ensure messaging values all people.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Execute Tool</CardTitle>
          <p className="text-sm text-muted-foreground">
            Fill in the required input fields to execute the tool
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-4">
            <label className="text-sm font-medium">Passage</label>
            <textarea
              placeholder="Enter passage..."
              className="min-h-[200px] w-full resize-y rounded-md border bg-background px-4 py-3"
            />
            <div className="text-xs text-muted-foreground">0 tokens</div>
          </div>

          <button className="w-full rounded-lg bg-primary px-4 py-3 font-medium text-primary-foreground">
            Execute
          </button>
        </CardContent>
      </Card>
    </div>
  )
} 