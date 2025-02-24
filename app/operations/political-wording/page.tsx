"use server"

import { PoliticalWordingClientWrapper } from "@/components/features/political-wording/political-wording-client-wrapper"

export default async function PoliticalWordingPage() {
  return (
    <div className="container py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Political Wording Analysis</h1>
        <p className="text-muted-foreground">
          Analyze and optimize your content's political messaging and implications
        </p>
      </div>
      <PoliticalWordingClientWrapper />
    </div>
  )
} 