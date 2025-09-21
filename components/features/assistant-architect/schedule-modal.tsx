"use client"

import { useState } from "react"
import { Calendar, Clock } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { ScheduleForm } from "./schedule-form"
import type { AssistantArchitectWithRelations } from "@/types/assistant-architect-types"

interface ScheduleModalProps {
  tool: AssistantArchitectWithRelations
  inputData: Record<string, unknown>
  triggerButton?: React.ReactNode
  onScheduleCreated?: () => void
}

export function ScheduleModal({
  tool,
  inputData,
  triggerButton,
  onScheduleCreated
}: ScheduleModalProps) {
  const [open, setOpen] = useState(false)

  const handleScheduleCreated = () => {
    setOpen(false)
    onScheduleCreated?.()
  }

  const defaultTrigger = (
    <Button variant="outline" className="gap-2">
      <Calendar className="h-4 w-4" />
      Schedule
    </Button>
  )

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {triggerButton || defaultTrigger}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Schedule Assistant Execution
          </DialogTitle>
          <DialogDescription>
            Set up automated execution for &quot;{tool.name}&quot;. Your schedule will run with the current form inputs.
          </DialogDescription>
        </DialogHeader>

        <ScheduleForm
          tool={tool}
          inputData={inputData}
          onSuccess={handleScheduleCreated}
          onCancel={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  )
}