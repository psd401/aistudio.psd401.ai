"use server"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default async function CommunicationAnalysisPage() {
  return (
    <div className="section-container">
      <div className="page-header">
        <h1 className="text-2xl font-semibold tracking-tight">Communication Analysis</h1>
        <p className="text-muted-foreground">
          Analyze your message for different audiences and get AI-powered feedback
        </p>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Message Analysis</CardTitle>
            <p className="text-sm text-muted-foreground">
              Enter your message and select an audience to analyze it for
            </p>
          </CardHeader>
          <CardContent>
            <textarea
              placeholder="Enter your message here..."
              className="min-h-[200px] w-full resize-y rounded-md border bg-background px-4 py-3"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Audience Analysis</CardTitle>
            <p className="text-sm text-muted-foreground">
              Analyze for specific audiences
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <button className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
                Community Members
              </button>
              <button className="rounded-full bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground">
                Parents
              </button>
              <button className="rounded-full bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground">
                Staff
              </button>
            </div>
            <button className="w-full rounded-lg bg-primary px-4 py-3 font-medium text-primary-foreground">
              Analyze for Community Members
            </button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Meta Analysis</CardTitle>
            <p className="text-sm text-muted-foreground">
              Analyze across all audiences
            </p>
          </CardHeader>
          <CardContent>
            <button className="w-full rounded-lg bg-primary px-4 py-3 font-medium text-primary-foreground">
              Run Meta Analysis
            </button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
} 