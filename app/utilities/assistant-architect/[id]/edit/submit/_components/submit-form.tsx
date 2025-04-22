"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { SelectAssistantArchitect } from "@/db/schema"
import { submitAssistantArchitectForApprovalAction } from "@/actions/db/assistant-architect-actions"
import { toast } from "sonner"
import { AlertCircle, CheckCircle2 } from "lucide-react"

interface Props {
  id: string
  tool: SelectAssistantArchitect
}

export function SubmitForm({ id, tool }: Props) {
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  const handleSubmit = async () => {
    try {
      setIsLoading(true)
      const result = await submitAssistantArchitectForApprovalAction(id)
      
      if (result.isSuccess) {
        toast.success("Assistant submitted for approval")
        router.push(`/utilities/assistant-architect/${id}`)
      } else {
        toast.error(result.message)
      }
    } catch (error) {
      toast.error("Failed to submit assistant")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardDescription>
            Verify all required components are complete before submitting
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="font-medium">Required Components</div>
            <div className="space-y-1">
              <RequirementItem
                title="Name"
                isComplete={!!tool.name}
                description="A descriptive name for your assistant"
              />
              <RequirementItem
                title="Description"
                isComplete={!!tool.description}
                description="A clear description of what your assistant does"
              />
              <RequirementItem
                title="Input Fields"
                isComplete={tool.inputFields?.length > 0}
                description="At least one input field defined"
              />
              <RequirementItem
                title="Prompts"
                isComplete={tool.prompts?.length > 0}
                description="At least one prompt configured"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button
          onClick={handleSubmit}
          disabled={isLoading || !isComplete(tool)}
        >
          Submit for Approval
        </Button>
      </div>
    </div>
  )
}

interface RequirementItemProps {
  title: string
  isComplete: boolean
  description: string
}

function RequirementItem({ title, isComplete, description }: RequirementItemProps) {
  return (
    <div className="flex items-start gap-2">
      {isComplete ? (
        <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
      ) : (
        <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />
      )}
      <div>
        <div className="font-medium">{title}</div>
        <div className="text-sm text-muted-foreground">{description}</div>
      </div>
    </div>
  )
}

function isComplete(tool: SelectAssistantArchitect): boolean {
  return !!(
    tool.name &&
    tool.description &&
    tool.inputFields?.length > 0 &&
    tool.prompts?.length > 0
  )
} 