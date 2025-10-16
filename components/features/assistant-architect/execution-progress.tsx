"use client"

import { memo } from 'react'
import { Loader2, CheckCircle2, Circle } from 'lucide-react'
import { Progress } from '@/components/ui/progress'

interface ExecutionProgressProps {
  totalPrompts: number
  prompts: Array<{
    id: number
    name: string
    position: number
  }>
  currentPrompt?: number
}

/**
 * ExecutionProgress Component
 *
 * Displays progress for multi-prompt Assistant Architect executions.
 * Shows current prompt being executed and overall progress.
 */
export const ExecutionProgress = memo(function ExecutionProgress({
  totalPrompts,
  prompts,
  currentPrompt
}: ExecutionProgressProps) {
  // Calculate progress percentage
  const currentPosition = currentPrompt || 1
  const progressPercentage = Math.round((currentPosition / totalPrompts) * 100)

  // Sort prompts by position
  const sortedPrompts = [...prompts].sort((a, b) => a.position - b.position)

  return (
    <div className="space-y-4 p-4 border rounded-lg bg-card/50">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-foreground">
            Execution Progress
          </h3>
          <p className="text-xs text-muted-foreground">
            Processing prompt chain ({currentPosition} of {totalPrompts})
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          <span className="text-sm font-medium text-primary">
            {progressPercentage}%
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <Progress value={progressPercentage} className="h-2" />

      {/* Prompt chain visualization */}
      {sortedPrompts.length > 0 && (
        <div className="space-y-2 mt-4">
          <p className="text-xs font-medium text-muted-foreground">
            Prompt Chain
          </p>
          <div className="space-y-1">
            {sortedPrompts.map((prompt, index) => {
              const position = index + 1
              const isCompleted = position < currentPosition
              const isCurrent = position === currentPosition
              const isPending = position > currentPosition

              return (
                <div
                  key={prompt.id}
                  className={`flex items-center gap-2 p-2 rounded-md transition-colors ${
                    isCurrent
                      ? 'bg-primary/10 border border-primary/20'
                      : isCompleted
                      ? 'bg-muted/50'
                      : 'bg-background'
                  }`}
                >
                  <div className="flex-shrink-0">
                    {isCompleted ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    ) : isCurrent ? (
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    ) : (
                      <Circle className="h-4 w-4 text-muted-foreground/50" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-xs truncate ${
                        isCurrent
                          ? 'font-semibold text-foreground'
                          : isCompleted
                          ? 'text-muted-foreground'
                          : 'text-muted-foreground/70'
                      }`}
                    >
                      {position}. {prompt.name}
                    </p>
                  </div>
                  <div className="flex-shrink-0">
                    {isCurrent && (
                      <span className="text-[10px] font-medium text-primary uppercase tracking-wide">
                        In Progress
                      </span>
                    )}
                    {isCompleted && (
                      <span className="text-[10px] font-medium text-green-600 uppercase tracking-wide">
                        Completed
                      </span>
                    )}
                    {isPending && (
                      <span className="text-[10px] font-medium text-muted-foreground/50 uppercase tracking-wide">
                        Pending
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
})

ExecutionProgress.displayName = 'ExecutionProgress'
