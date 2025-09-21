"use client"

import { useState, useEffect, useCallback } from "react"
import { Edit } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { toast } from "sonner"
import { createLogger, generateRequestId, sanitizeForLogging } from "@/lib/client-logger"
import type { Schedule } from "@/actions/db/schedule-actions"
import { ScheduleEditForm } from "./schedule-edit-form"

interface ScheduleEditModalProps {
  schedule: Schedule
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

export function ScheduleEditModal({ schedule, open, onClose, onSuccess }: ScheduleEditModalProps) {
  const [assistantArchitect, setAssistantArchitect] = useState<{ id: string; name: string; description?: string } | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const log = createLogger({ component: "ScheduleEditModal" })

  // Load the assistant architect details when modal opens
  const loadAssistantArchitect = useCallback(async (signal?: AbortSignal) => {
    setIsLoading(true)
    try {
      // Note: We need to create an API endpoint to get assistant architect details
      // For now, we'll create a minimal object with the required fields
      const mockArchitect = {
        id: schedule.assistantArchitectId.toString(),
        name: "Assistant Architect", // We'll enhance this later
        description: "Automated execution tool"
      }

      // Check if operation was aborted
      if (signal?.aborted) {
        return
      }

      setAssistantArchitect(mockArchitect)
    } catch (error) {
      // Don't log errors if the operation was aborted
      if (signal?.aborted) {
        return
      }

      const requestId = generateRequestId()
      log.error("Failed to load assistant architect", {
        requestId,
        assistantArchitectId: schedule.assistantArchitectId,
        error: sanitizeForLogging(error)
      })
      toast.error("Failed to load assistant architect details")
    } finally {
      if (!signal?.aborted) {
        setIsLoading(false)
      }
    }
  }, [schedule.assistantArchitectId, log])

  useEffect(() => {
    if (open && schedule.assistantArchitectId) {
      const abortController = new AbortController()
      loadAssistantArchitect(abortController.signal)

      return () => {
        abortController.abort()
      }
    }
  }, [open, schedule.assistantArchitectId, loadAssistantArchitect])

  const handleSuccess = () => {
    onSuccess()
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(newOpen) => !newOpen && onClose()}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Edit className="h-5 w-5" />
            Edit Schedule
          </DialogTitle>
          <DialogDescription>
            Update the schedule settings for &quot;{schedule.name}&quot;
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            <span className="ml-2">Loading schedule details...</span>
          </div>
        ) : (
          <ScheduleEditForm
            schedule={schedule}
            tool={assistantArchitect}
            onSuccess={handleSuccess}
            onCancel={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}