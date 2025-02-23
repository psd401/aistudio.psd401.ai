"use client"

import { useState } from "react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { SelectAudience, SelectAnalysisPrompt, SelectAiModel } from "@/types"
import { toast } from "sonner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Loader2 } from "lucide-react"
import { Markdown } from "@/components/ui/markdown"

interface AudienceConfig {
  audience: SelectAudience
  model: SelectAiModel | null
  prompt: SelectAnalysisPrompt | null
}

interface CommunicationAnalysisProps {
  audiences: SelectAudience[]
  configs: AudienceConfig[]
}

export function CommunicationAnalysis({ audiences, configs }: CommunicationAnalysisProps) {
  const [message, setMessage] = useState("")
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [currentAudienceId, setCurrentAudienceId] = useState<string>("")
  const [results, setResults] = useState<Record<string, string>>({})

  const analyzeForAudience = async (audienceId: string, isMetaAnalysis: boolean = false, previousResults?: Array<{ id: string, name: string, result: string }>) => {
    const config = configs.find(c => c.audience.id === audienceId)
    if (!config?.model || !config?.prompt) {
      throw new Error("This audience is not properly configured. Please contact an administrator.")
    }

    const response = await fetch('/api/communication-analysis/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: message,
        audienceId,
        isMetaAnalysis,
        previousResults
      })
    })

    const data = await response.json()
    if (!data.isSuccess) {
      throw new Error(data.message)
    }

    return data.data
  }

  const handleAnalyze = async (audienceId: string) => {
    if (!message) {
      toast.error("Please enter a message to analyze")
      return
    }

    setIsAnalyzing(true)
    setCurrentAudienceId(audienceId)
    
    try {
      if (audienceId === "meta") {
        // First, analyze for all regular audiences
        const regularResults: Array<{ id: string, name: string, result: string }> = []
        for (const audience of regularAudiences) {
          const result = await analyzeForAudience(audience.id)
          regularResults.push({
            id: audience.id,
            name: audience.name,
            result
          })
          // Update the UI with each individual result as we get it
          setResults(prev => ({ ...prev, [audience.id]: result }))
        }

        // Then run the meta analysis with all results
        const metaResult = await analyzeForAudience("meta", true, regularResults)
        setResults(prev => ({ ...prev, meta: metaResult }))
      } else {
        // Regular single audience analysis
        const result = await analyzeForAudience(audienceId)
        setResults(prev => ({ ...prev, [audienceId]: result }))
      }

      toast.success("Analysis completed")
    } catch (error) {
      console.error('Error in handleAnalyze:', error)
      toast.error(error instanceof Error ? error.message : "Failed to analyze message")
    } finally {
      setIsAnalyzing(false)
    }
  }

  // Filter out meta audience from regular audiences list
  const regularAudiences = audiences.filter(a => a.id !== "meta")
  const metaConfig = configs.find(c => c.audience.id === "meta")

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Message Analysis</CardTitle>
          <CardDescription>
            Enter your message and select an audience to analyze it for
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            placeholder="Enter your message here..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="min-h-[200px]"
          />
          
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Audience Analysis</CardTitle>
                <CardDescription>
                  Analyze for specific audiences
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

                  {regularAudiences.map(audience => (
                    <TabsContent key={audience.id} value={audience.id} className="space-y-4">
                      <Button
                        onClick={() => handleAnalyze(audience.id)}
                        disabled={isAnalyzing || !message}
                        className="w-full"
                      >
                        {isAnalyzing && currentAudienceId === audience.id ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Analyzing...
                          </>
                        ) : (
                          `Analyze for ${audience.name}`
                        )}
                      </Button>
                      {results[audience.id] && (
                        <div className="rounded-lg bg-muted p-4">
                          <Markdown content={results[audience.id]} />
                        </div>
                      )}
                    </TabsContent>
                  ))}
                </Tabs>
              </CardContent>
            </Card>

            {metaConfig && (
              <Card>
                <CardHeader>
                  <CardTitle>Meta Analysis</CardTitle>
                  <CardDescription>Analyze across all audiences</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <Button
                      onClick={() => handleAnalyze("meta")}
                      disabled={isAnalyzing || !message}
                      className="w-full"
                    >
                      {isAnalyzing && currentAudienceId === "meta" ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Analyzing...
                        </>
                      ) : (
                        "Run Meta Analysis"
                      )}
                    </Button>
                    {results["meta"] && (
                      <div className="rounded-lg bg-muted p-4">
                        <Markdown content={results["meta"]} />
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
} 