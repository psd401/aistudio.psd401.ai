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
import { Check, X, Edit } from "lucide-react"
import { SelectAssistantArchitect } from "@/db/schema"
import Link from "next/link"
import { useRouter } from "next/navigation"

interface AssistantArchitectApprovalProps {
  request: SelectAssistantArchitect & {
    inputFields: any[]
    prompts: any[]
  }
  isApproved?: boolean
}

export function AssistantArchitectApproval({
  request,
  isApproved = false
}: AssistantArchitectApprovalProps) {
  const [isProcessing, setIsProcessing] = useState(false)
  const [rejectionReason, setRejectionReason] = useState("")
  const [showRejectionForm, setShowRejectionForm] = useState(false)
  const { toast } = useToast()
  const router = useRouter()

  async function handleApprove() {
    try {
      setIsProcessing(true)
      const result = await approveAssistantArchitectAction(request.id)
      if (result.isSuccess) {
        toast({
          title: "Success",
          description: "Assistant approved successfully"
        })
        router.refresh()
      } else {
        toast({
          title: "Error",
          description: result.message,
          variant: "destructive"
        })
      }
    } catch (error) {
      console.error("Error approving assistant:", error)
      toast({
        title: "Error",
        description: "Failed to approve assistant",
        variant: "destructive"
      })
    } finally {
      setIsProcessing(false)
    }
  }

  async function handleReject() {
    if (!rejectionReason) {
      toast({
        title: "Error",
        description: "Please provide a reason for rejection",
        variant: "destructive"
      })
      return
    }

    try {
      setIsProcessing(true)
      const result = await rejectAssistantArchitectAction(request.id)
      if (result.isSuccess) {
        toast({
          title: "Success",
          description: "Assistant rejected successfully"
        })
        router.refresh()
      } else {
        toast({
          title: "Error",
          description: result.message,
          variant: "destructive"
        })
      }
    } catch (error) {
      console.error("Error rejecting assistant:", error)
      toast({
        title: "Error",
        description: "Failed to reject assistant",
        variant: "destructive"
      })
    } finally {
      setIsProcessing(false)
      setShowRejectionForm(false)
      setRejectionReason("")
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{request.name}</CardTitle>
        <CardDescription className="text-sm">{request.description}</CardDescription>
      </CardHeader>

      <CardContent>
        <div className="space-y-4">
          <div>
            <h4 className="text-sm font-medium mb-2">Input Fields</h4>
            <ul className="list-disc list-inside text-sm">
              {request.inputFields.map((field: any) => (
                <li key={field.id}>{field.name}</li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="text-sm font-medium mb-2">Prompts</h4>
            <ul className="list-disc list-inside text-sm">
              {request.prompts.map((prompt: any) => (
                <li key={prompt.id}>{prompt.name}</li>
              ))}
            </ul>
          </div>
        </div>
      </CardContent>

      <CardFooter className="flex justify-end gap-2">
        {isApproved ? (
          <Button variant="outline" asChild>
            <Link href={`/utilities/assistant-architect/${request.id}/edit`}>
              <Edit className="h-4 w-4 mr-2" />
              Edit
            </Link>
          </Button>
        ) : (
          <>
            {showRejectionForm ? (
              <div className="space-y-4 w-full">
                <Textarea
                  placeholder="Reason for rejection"
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                />
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setShowRejectionForm(false)}
                    disabled={isProcessing}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={handleReject}
                    disabled={isProcessing}
                  >
                    Confirm Rejection
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <Button
                  variant="destructive"
                  onClick={() => setShowRejectionForm(true)}
                  disabled={isProcessing}
                >
                  <X className="h-4 w-4 mr-2" />
                  Reject
                </Button>
                <Button onClick={handleApprove} disabled={isProcessing}>
                  <Check className="h-4 w-4 mr-2" />
                  Approve
                </Button>
              </>
            )}
          </>
        )}
      </CardFooter>
    </Card>
  )
} 