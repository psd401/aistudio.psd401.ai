"use server"

import { CommunicationAnalysisClientWrapper } from "@/components/features/communication-analysis/communication-analysis-client-wrapper"

export default async function CommunicationAnalysisPage() {
  return (
    <div className="container py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Communication Analysis</h1>
        <p className="text-muted-foreground">
          Analyze your message for different audiences and get AI-powered feedback
        </p>
      </div>
      <CommunicationAnalysisClientWrapper />
    </div>
  )
} 