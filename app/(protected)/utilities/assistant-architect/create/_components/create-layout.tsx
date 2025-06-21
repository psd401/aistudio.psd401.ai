"use client"

import Link from "next/link"
import { WizardSteps } from "@/components/ui/wizard-steps"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ChevronLeft } from "lucide-react"
import { useEffect, useState } from "react"
import { getAssistantArchitectAction } from "@/actions/db/assistant-architect-actions"

interface CreateLayoutProps {
  children: React.ReactNode
  currentStep: number
  assistantId?: string
  title: string
}

const steps = [
  { number: 1, title: "Create Assistant", href: "/utilities/assistant-architect/create" },
  { number: 2, title: "Add Input Fields", href: "/utilities/assistant-architect/create/input-fields" },
  { number: 3, title: "Add Prompts", href: "/utilities/assistant-architect/create/prompts" },
  { number: 4, title: "Preview & Test", href: "/utilities/assistant-architect/create/preview" },
  { number: 5, title: "Submit for Approval", href: "/utilities/assistant-architect/create/submit" }
]

export function CreateLayout({ children, currentStep, assistantId, title }: CreateLayoutProps) {
  const [assistantName, setAssistantName] = useState<string>("")

  useEffect(() => {
    async function fetchAssistantName() {
      if (assistantId) {
        const result = await getAssistantArchitectAction(assistantId)
        if (result.isSuccess && result.data) {
          setAssistantName(result.data.name)
        }
      }
    }
    fetchAssistantName()
  }, [assistantId])

  // Update hrefs if we have an assistantId
  const updatedSteps = steps.map(step => {
    let href = step.href
    if (assistantId) {
      // For editing, all steps should use the /[id]/edit pattern
      href = step.number === 1 
        ? `/utilities/assistant-architect/${assistantId}/edit`
        : `/utilities/assistant-architect/${assistantId}/edit/${step.href.split('/').pop()}`
    }
    return {
      ...step,
      href,
      isCurrent: step.number === currentStep,
      isComplete: step.number < currentStep
    }
  })

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="flex items-center space-x-2 text-muted-foreground">
          <Link 
            href="/utilities/assistant-architect" 
            className="flex items-center hover:text-foreground transition-colors"
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Back to Assistants
          </Link>
        </div>
        <h1 className="text-3xl font-bold">
          Assistant Architect
          {assistantName && (
            <>: {assistantName}</>
          )}
        </h1>
      </div>

      <WizardSteps steps={updatedSteps} />
      
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>
          {children}
        </CardContent>
      </Card>
    </div>
  )
} 