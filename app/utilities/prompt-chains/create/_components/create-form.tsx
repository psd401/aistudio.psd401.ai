"use client"

import { PromptChainForm } from "@/components/features/prompt-chains/prompt-chain-form"

export function CreateForm() {
  return (
    <div className="container py-8">
      <h1 className="text-3xl font-bold mb-8">Create Prompt Chain Tool</h1>
      <PromptChainForm />
    </div>
  )
} 