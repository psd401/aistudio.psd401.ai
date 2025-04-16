"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from "@/components/ui/card"
import { useToast } from "@/components/ui/use-toast"
import {
  approveAssistantArchitectAction,
  rejectAssistantArchitectAction
} from "@/actions/db/assistant-architect-actions"
import { Textarea } from "@/components/ui/textarea"
import { Check, X } from "lucide-react"

interface PendingAssistantArchitect {
  id: string
  name: string
  description?: string | null
  creatorId: string
  inputFields: any[]
  prompts: any[]
}

interface AssistantArchitectApprovalProps {
  request: PendingAssistantArchitect
  onProcessed?: () => void
}

export function AssistantArchitectApproval({ request, onProcessed }: AssistantArchitectApprovalProps) {
  const [rejectionReason, setRejectionReason] = useState("")
  const [isRejecting, setIsRejecting] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const { toast } = useToast()

  async function handleApprove() {
    setIsLoading(true)
    const result = await approveAssistantArchitectAction(request.id)
    setIsLoading(false)

    if (result.isSuccess) {
      toast({ title: "Success", description: "Assistant Architect approved." })
      if (onProcessed) onProcessed()
    } else {
      toast({
        variant: "destructive",
        title: "Error Approving",
        description: result.message || "Failed to approve Assistant Architect."
      })
    }
  }

  async function handleReject() {
    setIsLoading(true)
    const result = await rejectAssistantArchitectAction({
      id: request.id,
      reason: rejectionReason
    })
    setIsLoading(false)

    if (result.isSuccess) {
      toast({ title: "Success", description: "Assistant Architect rejected." })
      setIsRejecting(false)
      if (onProcessed) onProcessed()
    } else {
      toast({
        variant: "destructive",
        title: "Error Rejecting",
        description: result.message || "Failed to reject Assistant Architect."
      })
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{request.name}</CardTitle>
        <CardDescription>
          {request.description || "No description provided."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <h4 className="font-medium mb-2">Input Fields:</h4>
          {request.inputFields.length > 0 ? (
            <ul className="list-disc list-inside text-sm space-y-1">
              {request.inputFields.map((field) => (
                <li key={field.id}>{field.label} ({field.name} - {field.type})</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No input fields defined.</p>
          )}
        </div>
         <div>
          <h4 className="font-medium mb-2">Prompts:</h4>
          {request.prompts.length > 0 ? (
            <ul className="list-decimal list-inside text-sm space-y-1">
              {request.prompts.map((prompt) => (
                <li key={prompt.id}>{prompt.name || `Prompt ${prompt.position + 1}`} ({prompt.type})</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No prompts defined.</p>
          )}
        </div>

        {isRejecting && (
          <div className="space-y-2 pt-4 border-t">
            <label htmlFor={`reject-reason-${request.id}`} className="font-medium text-sm">Rejection Reason (Optional)</label>
            <Textarea
              id={`reject-reason-${request.id}`}
              placeholder="Provide feedback for the creator..."
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
            />
             <Button
              variant="destructive"
              onClick={handleReject}
              disabled={isLoading}
              size="sm"
            >
              {isLoading ? "Rejecting..." : "Confirm Rejection"}
            </Button>
             <Button
              variant="outline"
              onClick={() => setIsRejecting(false)}
              disabled={isLoading}
              size="sm"
            >
              Cancel Rejection
            </Button>
          </div>
        )}
      </CardContent>
      {!isRejecting && (
        <CardFooter className="flex justify-end space-x-2">
          <Button
            variant="outline"
            onClick={() => setIsRejecting(true)}
            disabled={isLoading}
          >
            <X className="mr-2 h-4 w-4" /> Reject
          </Button>
          <Button onClick={handleApprove} disabled={isLoading}>
             <Check className="mr-2 h-4 w-4" /> Approve
          </Button>
        </CardFooter>
      )}
    </Card>
  )
} 