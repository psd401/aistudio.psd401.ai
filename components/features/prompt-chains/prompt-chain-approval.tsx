"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { useToast } from "@/components/ui/use-toast"
import {
  approvePromptChainToolAction,
  rejectPromptChainToolAction
} from "@/actions/db/prompt-chains-actions"
import type { ToolApprovalRequest } from "@/types"

interface PromptChainApprovalProps {
  request: ToolApprovalRequest
}

export function PromptChainApproval({ request }: PromptChainApprovalProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [isLoading, setIsLoading] = useState(false)
  const [rejectionReason, setRejectionReason] = useState("")
  const [showRejectionForm, setShowRejectionForm] = useState(false)

  const sortedInputFields = [...request.inputFields].sort(
    (a, b) => a.position - b.position
  )

  const sortedPrompts = [...request.prompts].sort(
    (a, b) => a.position - b.position
  )

  async function handleApprove() {
    try {
      setIsLoading(true)
      const result = await approvePromptChainToolAction(request.id)

      if (!result.isSuccess) {
        throw new Error(result.message)
      }

      toast({
        title: "Success",
        description: "Tool approved successfully"
      })

      router.refresh()
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to approve tool",
        variant: "destructive"
      })
    } finally {
      setIsLoading(false)
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
      setIsLoading(true)
      const result = await rejectPromptChainToolAction({
        id: request.id,
        reason: rejectionReason
      })

      if (!result.isSuccess) {
        throw new Error(result.message)
      }

      toast({
        title: "Success",
        description: "Tool rejected successfully"
      })

      router.refresh()
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to reject tool",
        variant: "destructive"
      })
    } finally {
      setIsLoading(false)
      setShowRejectionForm(false)
    }
  }

  return (
    <div className="space-y-8">
      {/* Tool Info */}
      <Card>
        <CardHeader>
          <CardTitle>{request.name}</CardTitle>
          <CardDescription>
            Created by {request.creatorId} on{" "}
            {new Date(request.createdAt).toLocaleDateString()}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {request.description}
          </p>
        </CardContent>
      </Card>

      {/* Input Fields */}
      <Card>
        <CardHeader>
          <CardTitle>Input Fields</CardTitle>
          <CardDescription>
            Fields that users will need to provide
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {sortedInputFields.map((field) => (
              <div
                key={field.id}
                className="flex items-center justify-between p-4 border rounded-lg"
              >
                <div>
                  <h4 className="font-medium">{field.name}</h4>
                  <p className="text-sm text-muted-foreground">
                    Type: {field.fieldType}
                  </p>
                  {field.options && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {field.options.map((option: any) => (
                        <Badge key={option.value || option.label} variant="secondary">
                          {option.label}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
                <Badge>{field.position + 1}</Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Prompts */}
      <Card>
        <CardHeader>
          <CardTitle>Prompts</CardTitle>
          <CardDescription>
            The chain of prompts to be executed
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {sortedPrompts.map((prompt) => (
              <div
                key={prompt.id}
                className="flex flex-col p-4 border rounded-lg space-y-2"
              >
                <div className="flex items-center justify-between">
                  <h4 className="font-medium">{prompt.name}</h4>
                  <div className="flex items-center gap-2">
                    {prompt.parallelGroup !== null && (
                      <Badge variant="secondary">
                        Group {prompt.parallelGroup}
                      </Badge>
                    )}
                    <Badge>{prompt.position + 1}</Badge>
                  </div>
                </div>

                <ScrollArea className="h-[200px] w-full rounded-md border p-4">
                  <pre className="text-sm whitespace-pre-wrap">{prompt.content}</pre>
                </ScrollArea>

                {prompt.inputMapping && Object.keys(prompt.inputMapping).length > 0 && (
                  <>
                    <Separator />
                    <div className="space-y-1">
                      <p className="text-sm font-medium">Input Mappings:</p>
                      {Object.entries(prompt.inputMapping).map(([variable, promptId]) => {
                        const sourcePrompt = sortedPrompts.find(p => p.id === promptId)
                        return (
                          <p key={variable} className="text-sm text-muted-foreground">
                            ${variable} ← {sourcePrompt?.name || "Unknown"}
                          </p>
                        )
                      })}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex items-center space-x-4">
        <Button
          onClick={handleApprove}
          disabled={isLoading}
          className="flex-1"
        >
          {isLoading ? "Approving..." : "Approve"}
        </Button>
        <Button
          onClick={() => setShowRejectionForm(true)}
          disabled={isLoading}
          variant="destructive"
          className="flex-1"
        >
          Reject
        </Button>
      </div>

      {/* Rejection Form */}
      {showRejectionForm && (
        <Card>
          <CardHeader>
            <CardTitle>Reject Tool</CardTitle>
            <CardDescription>
              Please provide a reason for rejection
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <Textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Enter rejection reason..."
                className="min-h-[100px]"
              />
              <div className="flex items-center space-x-4">
                <Button
                  onClick={handleReject}
                  disabled={isLoading}
                  variant="destructive"
                  className="flex-1"
                >
                  {isLoading ? "Rejecting..." : "Confirm Rejection"}
                </Button>
                <Button
                  onClick={() => {
                    setShowRejectionForm(false)
                    setRejectionReason("")
                  }}
                  disabled={isLoading}
                  variant="outline"
                  className="flex-1"
                >
                  Cancel
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
} 