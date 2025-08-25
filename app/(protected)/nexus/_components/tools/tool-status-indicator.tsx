'use client'

import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Globe, Code2, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getToolConfig } from '@/lib/tools'

interface ToolStatusIndicatorProps {
  enabledTools: string[]
  className?: string
  variant?: 'default' | 'minimal'
}

const TOOL_ICONS = {
  webSearch: Globe,
  codeInterpreter: Code2
} as const

export function ToolStatusIndicator({ 
  enabledTools, 
  className,
  variant = 'default' 
}: ToolStatusIndicatorProps) {
  if (enabledTools.length === 0) {
    return null
  }

  if (variant === 'minimal') {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge 
              variant="secondary" 
              className={cn("h-5 px-2 py-0 text-xs", className)}
            >
              <Zap className="h-3 w-3 mr-1" />
              {enabledTools.length}
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <div className="space-y-1">
              <p className="text-xs font-medium">Active AI Tools:</p>
              {enabledTools.map(toolName => {
                const config = getToolConfig(toolName)
                return (
                  <p key={toolName} className="text-xs">
                    • {config?.displayName || toolName}
                  </p>
                )
              })}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  return (
    <div className={cn("flex items-center gap-1", className)} data-testid="tool-status-indicator">
      {enabledTools.slice(0, 3).map(toolName => {
        const config = getToolConfig(toolName)
        const IconComponent = TOOL_ICONS[toolName as keyof typeof TOOL_ICONS] || Zap

        return (
          <TooltipProvider key={toolName}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge 
                  variant="outline" 
                  className="h-5 px-1.5 py-0 text-xs border-primary/20"
                >
                  <IconComponent className="h-3 w-3" />
                </Badge>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p className="text-xs">
                  {config?.displayName || toolName}: {config?.description || 'Tool active'}
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )
      })}
      {enabledTools.length > 3 && (
        <Badge variant="secondary" className="h-5 px-2 py-0 text-xs">
          +{enabledTools.length - 3}
        </Badge>
      )}
    </div>
  )
}