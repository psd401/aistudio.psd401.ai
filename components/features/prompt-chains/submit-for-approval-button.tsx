"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/use-toast"
import { submitPromptChainToolForApprovalAction } from "@/actions/db/prompt-chains-actions"

interface SubmitForApprovalButtonProps {
  toolId: string
}

export function SubmitForApprovalButton({ toolId }: SubmitForApprovalButtonProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmitForApproval = async () => {
    try {
      setIsSubmitting(true)
      const result = await submitPromptChainToolForApprovalAction(toolId)

      if (!result.isSuccess) {
        throw new Error(result.message)
      }

      toast({
        title: "Success",
        description: "Tool submitted for approval"
      })

      // Refresh the page data
      router.refresh()
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to submit tool for approval",
        variant: "destructive"
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Button 
      onClick={handleSubmitForApproval} 
      disabled={isSubmitting}
      className="mt-4"
    >
      {isSubmitting ? "Submitting..." : "Submit for Approval"}
    </Button>
  )
} 