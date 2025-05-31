"use client"

import { useState, useEffect } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { SelectMetaPromptingTechnique, SelectMetaPromptingTemplate } from "@/db/schema"
import { IconHelpCircle, IconWand } from "@tabler/icons-react"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

interface MetaPromptingToolProps {
  techniques: SelectMetaPromptingTechnique[]
  templates: SelectMetaPromptingTemplate[]
  initialTechniqueId: string
}

export function MetaPromptingTool({ techniques, templates, initialTechniqueId }: MetaPromptingToolProps) {
  const [selectedTechniqueId, setSelectedTechniqueId] = useState<string>(initialTechniqueId)
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("")
  const [input, setInput] = useState("")
  const [variables, setVariables] = useState<Record<string, string>>({})
  const [output, setOutput] = useState("")
  const [isLoading, setIsLoading] = useState(false)

  // Update selected technique when initialTechniqueId changes
  useEffect(() => {
    setSelectedTechniqueId(initialTechniqueId)
    setSelectedTemplateId("")
    setVariables({})
    setInput("")
    setOutput("")
  }, [initialTechniqueId])

  const selectedTechnique = techniques.find(t => t.id === selectedTechniqueId)
  const selectedTemplate = templates.find(t => t.id === selectedTemplateId)
  const availableTemplates = templates.filter(t => t.techniqueId === selectedTechniqueId)

  const handleGenerate = async () => {
    if (!selectedTechnique) {
      toast.error("Please select a technique")
      return
    }

    setIsLoading(true)
    try {
      const response = await fetch("/api/meta-prompting/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          config: {
            technique: selectedTechnique,
            template: selectedTemplate,
            variables
          },
          input
        })
      })
      
      const result = await response.json()
      
      if (result.isSuccess) {
        setOutput(result.data)
      } else {
        toast.error(result.message)
      }
    } catch (error) {
      toast.error("Failed to generate meta-prompt")
      console.error("Error in meta-prompting-tool", error)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <TooltipProvider>
      <div className="max-w-4xl mx-auto">
        <div className="grid gap-6">
          {/* Technique Selection */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-medium">Choose a Technique</h2>
              <Tooltip>
                <TooltipTrigger>
                  <IconHelpCircle className="h-4 w-4 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent>
                  Select a technique based on what you want to achieve
                </TooltipContent>
              </Tooltip>
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {techniques.map((technique) => (
                <Card 
                  key={technique.id}
                  className={cn(
                    "relative cursor-pointer transition-colors",
                    selectedTechniqueId === technique.id && "border-primary"
                  )}
                  onClick={() => {
                    setSelectedTechniqueId(technique.id)
                    setSelectedTemplateId("")
                    setVariables({})
                    setInput("")
                    setOutput("")
                  }}
                >
                  {selectedTechniqueId === technique.id && (
                    <div className="absolute right-4 top-4 z-10">
                      <div className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                        Selected
                      </div>
                    </div>
                  )}
                  <CardHeader>
                    <CardTitle>{technique.name}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      {technique.description}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {selectedTechnique && (
            <>
              {/* Template Selection */}
              {availableTemplates.length > 0 && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-medium">Choose a Template (Optional)</h2>
                    <Tooltip>
                      <TooltipTrigger>
                        <IconHelpCircle className="h-4 w-4 text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent>
                        Templates help structure your input for better results
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <Select
                    value={selectedTemplateId}
                    onValueChange={(value) => {
                      setSelectedTemplateId(value)
                      setVariables({})
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue>
                        {selectedTemplate ? (
                          <div>
                            <div>{selectedTemplate.name}</div>
                            <p className="text-sm text-muted-foreground">
                              {selectedTemplate.description}
                            </p>
                          </div>
                        ) : (
                          "Select a template"
                        )}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {availableTemplates.map((template) => (
                        <SelectItem key={template.id} value={template.id}>
                          <div>
                            <div>{template.name}</div>
                            <p className="text-sm text-muted-foreground">
                              {template.description}
                            </p>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Template Variables */}
              {selectedTemplate?.variables && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-medium">Template Variables</h2>
                    <Tooltip>
                      <TooltipTrigger>
                        <IconHelpCircle className="h-4 w-4 text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent>
                        Fill in these variables to customize the template
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    {Object.entries(selectedTemplate.variables).map(([key, description]) => (
                      <div key={key} className="space-y-2">
                        <Label className="text-sm font-medium">{description}</Label>
                        <Input
                          value={variables[key] || ""}
                          onChange={(e) =>
                            setVariables((prev) => ({
                              ...prev,
                              [key]: e.target.value
                            }))
                          }
                          placeholder={`Enter ${key}`}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Input */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-medium">What do you want to achieve?</h2>
                  <Tooltip>
                    <TooltipTrigger>
                      <IconHelpCircle className="h-4 w-4 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-sm">
                      <p className="font-medium mb-1">{selectedTechnique.name}</p>
                      <p className="mb-2">{selectedTechnique.description}</p>
                      <p className="text-sm italic">Example: {selectedTechnique.example}</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <Card>
                  <CardContent className="p-0">
                    <Textarea
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      placeholder={
                        selectedTechnique.exampleInput || 
                        "Describe what you want to achieve..."
                      }
                      className="min-h-[150px] border-0 focus-visible:ring-0 px-3 py-2 placeholder:text-muted-foreground text-base rounded-lg"
                    />
                  </CardContent>
                </Card>
              </div>

              {/* Generate Button */}
              <Button
                onClick={handleGenerate}
                disabled={isLoading || !input}
                className="w-full py-6 text-lg"
                size="lg"
              >
                <IconWand className="mr-2 h-5 w-5" />
                {isLoading ? "Generating..." : "Generate"}
              </Button>

              {/* Output */}
              {output && (
                <div className="space-y-4">
                  <h2 className="text-lg font-medium">Generated Result</h2>
                  <Card className="bg-accent">
                    <CardContent className="p-0">
                      <pre className="whitespace-pre-wrap font-mono text-sm px-3 py-2 rounded-lg">
                        {output}
                      </pre>
                    </CardContent>
                  </Card>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </TooltipProvider>
  )
} 