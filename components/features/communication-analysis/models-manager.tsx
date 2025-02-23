"use client"

import { useState, useEffect } from "react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { SelectAudience, SelectAnalysisPrompt, SelectAiModel } from "@/types"
import { toast } from "sonner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Save } from "lucide-react"
import { upsertPromptAction } from "@/actions/db/communication-analysis-actions"

interface AudienceConfig {
  audience: SelectAudience
  model: SelectAiModel | null
  prompt: SelectAnalysisPrompt | null
}

interface ModelsManagerProps {
  audiences: SelectAudience[]
  availableModels: SelectAiModel[]
  initialConfigs: AudienceConfig[]
}

export function ModelsManager({ audiences, availableModels, initialConfigs }: ModelsManagerProps) {
  const [configs, setConfigs] = useState<AudienceConfig[]>(initialConfigs)
  const [isUpdating, setIsUpdating] = useState(false)
  const [editedPrompts, setEditedPrompts] = useState<Record<string, string>>(() => {
    // Initialize with existing prompts
    const initial: Record<string, string> = {}
    initialConfigs.forEach(config => {
      if (config.prompt?.prompt) {
        initial[config.audience.id] = config.prompt.prompt
      }
    })
    return initial
  })
  const [unsavedChanges, setUnsavedChanges] = useState<Record<string, boolean>>({})

  const handleModelChange = async (audienceId: string, modelId: string) => {
    if (!audienceId || !modelId) return

    setIsUpdating(true)
    try {
      const result = await upsertPromptAction({
        audienceId,
        modelId,
        isMetaAnalysis: audienceId === "meta"
      })
      
      if (result.isSuccess) {
        setConfigs(configs.map(config => 
          config.audience.id === audienceId
            ? { ...config, model: availableModels.find(m => m.id === modelId) || null }
            : config
        ))
        toast.success(audienceId === "meta" ? "Meta analysis model updated successfully" : "Model updated successfully")
      } else {
        toast.error(result.message)
      }
    } catch (error) {
      toast.error("Failed to update model")
    } finally {
      setIsUpdating(false)
    }
  }

  const handlePromptEdit = (audienceId: string, value: string) => {
    if (!audienceId) return
    setEditedPrompts(prev => ({ ...prev, [audienceId]: value }))
    setUnsavedChanges(prev => ({ ...prev, [audienceId]: true }))
  }

  const handlePromptSave = async (audienceId: string) => {
    if (!audienceId) return

    const value = editedPrompts[audienceId]
    if (!value) return

    setIsUpdating(true)
    try {
      const result = await upsertPromptAction({
        audienceId,
        prompt: value,
        isMetaAnalysis: audienceId === "meta"
      })

      if (result.isSuccess) {
        setConfigs(configs.map(config =>
          config.audience.id === audienceId
            ? { ...config, prompt: result.data }
            : config
        ))
        setUnsavedChanges(prev => ({ ...prev, [audienceId]: false }))
        toast.success(audienceId === "meta" ? "Meta analysis prompt updated successfully" : "Prompt updated successfully")
      } else {
        toast.error(result.message)
      }
    } catch (error) {
      toast.error("Failed to update prompt")
    } finally {
      setIsUpdating(false)
    }
  }

  // Filter out meta audience from regular audiences list
  const regularAudiences = audiences.filter(a => a.id !== "meta")
  const metaConfig = configs.find(c => c.audience.id === "meta")

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Meta Analysis Configuration</CardTitle>
          <CardDescription>
            Configure the model and prompt for analyzing results across all audiences
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Model</label>
            <Select
              value={metaConfig?.model?.id}
              onValueChange={(value) => handleModelChange("meta", value)}
              disabled={isUpdating}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a model" />
              </SelectTrigger>
              <SelectContent>
                {availableModels.map(model => (
                  <SelectItem key={model.id} value={model.id}>
                    {model.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="text-sm font-medium">Meta Analysis Prompt</label>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePromptSave("meta")}
                disabled={isUpdating || !unsavedChanges["meta"]}
              >
                <Save className="h-4 w-4 mr-2" />
                Save Changes
              </Button>
            </div>
            <Textarea
              value={editedPrompts["meta"] ?? metaConfig?.prompt?.prompt ?? ""}
              onChange={(e) => handlePromptEdit("meta", e.target.value)}
              disabled={isUpdating}
              placeholder="Enter the prompt for meta analysis..."
              className="min-h-[100px]"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Audience Configurations</CardTitle>
          <CardDescription>
            Configure models and prompts for each audience
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue={regularAudiences[0]?.id} className="space-y-4">
            <TabsList>
              {regularAudiences.map(audience => (
                <TabsTrigger key={audience.id} value={audience.id}>
                  {audience.name}
                </TabsTrigger>
              ))}
            </TabsList>

            {regularAudiences.map(audience => {
              const config = configs.find(c => c.audience.id === audience.id)
              return (
                <TabsContent key={audience.id} value={audience.id} className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Model</label>
                    <Select
                      value={config?.model?.id}
                      onValueChange={(value) => handleModelChange(audience.id, value)}
                      disabled={isUpdating}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a model" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableModels.map(model => (
                          <SelectItem key={model.id} value={model.id}>
                            {model.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <label className="text-sm font-medium">Analysis Prompt</label>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePromptSave(audience.id)}
                        disabled={isUpdating || !unsavedChanges[audience.id]}
                      >
                        <Save className="h-4 w-4 mr-2" />
                        Save Changes
                      </Button>
                    </div>
                    <Textarea
                      value={editedPrompts[audience.id] ?? config?.prompt?.prompt ?? ""}
                      onChange={(e) => handlePromptEdit(audience.id, e.target.value)}
                      disabled={isUpdating}
                      placeholder="Enter the prompt for this audience..."
                      className="min-h-[100px]"
                    />
                  </div>
                </TabsContent>
              )
            })}
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
} 