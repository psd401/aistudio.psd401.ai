"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { InputFieldForm } from "./input-field-form"
import { ChainPromptForm } from "./chain-prompt-form"
import type {
  PromptChainToolWithRelations,
  SelectAiModel,
  SelectToolInputField,
  SelectChainPrompt
} from "@/types"

interface PromptChainConfigProps {
  tool: PromptChainToolWithRelations
  models: SelectAiModel[]
  onUpdate?: () => void
}

export function PromptChainConfig({ tool, models, onUpdate }: PromptChainConfigProps) {
  const [showInputFieldDialog, setShowInputFieldDialog] = useState(false)
  const [showPromptDialog, setShowPromptDialog] = useState(false)

  const sortedInputFields = [...(tool.inputFields || [])].sort(
    (a, b) => a.position - b.position
  )

  const sortedPrompts = [...(tool.prompts || [])].sort(
    (a, b) => a.position - b.position
  )

  return (
    <div className="space-y-8">
      {/* Input Fields Section */}
      <Card>
        <CardHeader>
          <CardTitle>Input Fields</CardTitle>
          <CardDescription>
            Configure the input fields for your tool
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {sortedInputFields.map((field: SelectToolInputField) => (
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
                      {field.options.map((option: any, index: number) => (
                        <Badge key={index} variant="secondary">
                          {option.label}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
                <Badge>{field.position + 1}</Badge>
              </div>
            ))}

            <Dialog open={showInputFieldDialog} onOpenChange={setShowInputFieldDialog}>
              <DialogTrigger asChild>
                <Button>Add Input Field</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Input Field</DialogTitle>
                </DialogHeader>
                <InputFieldForm
                  toolId={tool.id}
                  currentPosition={sortedInputFields.length}
                  onSuccess={() => {
                    setShowInputFieldDialog(false)
                    onUpdate?.()
                  }}
                />
              </DialogContent>
            </Dialog>
          </div>
        </CardContent>
      </Card>

      {/* Prompts Section */}
      <Card>
        <CardHeader>
          <CardTitle>Prompts</CardTitle>
          <CardDescription>
            Configure the prompts in your chain
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {sortedPrompts.map((prompt: SelectChainPrompt) => (
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

                <ScrollArea className="h-[100px] w-full rounded-md border p-2">
                  <pre className="text-sm">{prompt.content}</pre>
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

            <Dialog open={showPromptDialog} onOpenChange={setShowPromptDialog}>
              <DialogTrigger asChild>
                <Button>Add Prompt</Button>
              </DialogTrigger>
              <DialogContent className="max-w-3xl">
                <DialogHeader>
                  <DialogTitle>Add Prompt</DialogTitle>
                </DialogHeader>
                <ChainPromptForm
                  toolId={tool.id}
                  models={models}
                  isParallel={tool.isParallel}
                  previousPrompts={sortedPrompts.map(p => ({
                    id: p.id,
                    name: p.name
                  }))}
                  currentPosition={sortedPrompts.length}
                  onSuccess={() => {
                    setShowPromptDialog(false)
                    onUpdate?.()
                  }}
                />
              </DialogContent>
            </Dialog>
          </div>
        </CardContent>
      </Card>
    </div>
  )
} 