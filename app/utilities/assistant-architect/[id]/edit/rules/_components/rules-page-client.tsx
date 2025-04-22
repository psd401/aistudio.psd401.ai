"use client"

import { SelectRule } from "@/db/schema"

interface RulesPageClientProps {
  assistantId: string
  rules: SelectRule[]
}

export function RulesPageClient({ assistantId, rules }: RulesPageClientProps) {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold">Rules</h1>
          <p className="text-muted-foreground">
            Configure the rules for your assistant. Rules help guide your assistant in understanding and working with your codebase.
          </p>
        </div>
      </div>
    </div>
  )
} 