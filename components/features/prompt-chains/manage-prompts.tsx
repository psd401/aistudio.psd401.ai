"use server"

import { getAiModelsAction } from "@/actions/db/ai-models-actions"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ChainPromptForm } from "./chain-prompt-form"
import type { PromptChainToolWithRelations } from "@/types"

interface ManagePromptsProps {
  tool: PromptChainToolWithRelations
  canEdit: boolean
}

export async function ManagePrompts({ tool, canEdit }: ManagePromptsProps) {
  const modelsResult = await getAiModelsAction()
  const models = modelsResult.isSuccess ? modelsResult.data : []
  
  // Sort prompts by position
  const sortedPrompts = tool.prompts?.slice().sort((a, b) => a.position - b.position) || []

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Prompts</CardTitle>
        {canEdit && (
          <a href={`/utilities/prompt-chains/${tool.id}/add-prompt`}>
            <Button size="sm">Add Prompt</Button>
          </a>
        )}
      </CardHeader>
      <CardContent>
        {sortedPrompts.length === 0 ? (
          <p className="text-center text-muted-foreground py-4">
            No prompts have been added yet. 
            {canEdit && " Add a prompt to get started."}
          </p>
        ) : (
          <div className="space-y-4">
            {sortedPrompts.map((prompt, index) => (
              <div key={prompt.id} className="border rounded-lg p-4 space-y-2">
                <div className="flex justify-between">
                  <h3 className="font-medium">{prompt.name}</h3>
                  <div className="flex items-center space-x-2">
                    <span className="text-xs bg-slate-100 px-2 py-0.5 rounded">
                      Position: {prompt.position}
                    </span>
                    <span className="text-xs bg-slate-100 px-2 py-0.5 rounded">
                      Model: {models.find(m => m.id === prompt.modelId)?.name || "Unknown"}
                    </span>
                    {canEdit && (
                      <a href={`/utilities/prompt-chains/${tool.id}/edit-prompt/${prompt.id}`}>
                        <Button variant="outline" size="sm">Edit</Button>
                      </a>
                    )}
                  </div>
                </div>
                <div className="bg-muted p-3 rounded-md whitespace-pre-wrap text-sm">
                  {prompt.content}
                </div>
                
                {prompt.systemContext && canEdit && (
                  <div className="mt-2">
                    <h4 className="text-sm font-medium mb-1">System Context (Hidden from users)</h4>
                    <div className="bg-blue-50 border border-blue-200 p-3 rounded-md whitespace-pre-wrap text-sm">
                      {prompt.systemContext}
                    </div>
                  </div>
                )}
                
                {prompt.inputMapping && Object.keys(prompt.inputMapping).length > 0 && (
                  <div className="mt-2">
                    <h4 className="text-sm font-medium mb-1">Input Mappings</h4>
                    <div className="bg-muted p-3 rounded-md">
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        {Object.entries(prompt.inputMapping).map(([variable, sourceId]) => {
                          const sourcePrompt = sortedPrompts.find(p => p.id === sourceId)
                          return (
                            <div key={variable} className="flex gap-2">
                              <span className="font-mono">{variable}:</span>
                              <span className="text-muted-foreground">
                                {sourcePrompt ? sourcePrompt.name : sourceId}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
} 