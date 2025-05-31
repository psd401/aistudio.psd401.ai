"use client"

import { useState, useRef } from "react"
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
  
  // Use ref to track active requests and be able to cancel them
  const abortControllersRef = useRef<Record<string, AbortController>>({})
  
  // Track analysis in progress state
  const analysisInProgressRef = useRef<boolean>(false)

  const analyzeForAudience = async (audienceId: string, isMetaAnalysis: boolean = false, previousResults?: Array<{ id: string, name: string, result: string }>) => {
    const config = configs.find(c => c.audience.id === audienceId)
    if (!config?.model || !config?.prompt) {
      throw new Error("This audience is not properly configured. Please contact an administrator.")
    }
    
    // Cancel any existing request for this audience
    if (abortControllersRef.current[audienceId]) {
      abortControllersRef.current[audienceId].abort();
    }
    
    // Create a new controller for this request
    const controller = new AbortController();
    abortControllersRef.current[audienceId] = controller;
    
    try {
      const response = await fetch('/api/communication-analysis/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: message,
          audienceId,
          isMetaAnalysis,
          previousResults
        }),
        signal: controller.signal
      })
  
      // Check if the request was aborted
      if (controller.signal.aborted) {
        throw new Error("Request was cancelled");
      }
  
      const data = await response.json()
      if (!data.isSuccess) {
        throw new Error(data.message)
      }
  
      return data.data
    } catch (error) {
      // Don't throw error for aborted requests
      if (error instanceof Error && error.name === 'AbortError') {
        console.info(`Request for audience ${audienceId} was aborted`);
        return "";
      }
      throw error;
    } finally {
      // Clean up the controller reference
      delete abortControllersRef.current[audienceId];
    }
  }

  const handleAnalyze = async (audienceId: string) => {
    if (!message) {
      toast.error("Please enter a message to analyze")
      return
    }
    
    // Prevent multiple concurrent analyses
    if (analysisInProgressRef.current) {
      toast.info("An analysis is already in progress")
      return
    }
    
    // Cancel all existing requests
    Object.values(abortControllersRef.current).forEach(controller => {
      controller.abort()
    })
    abortControllersRef.current = {}
    
    setIsAnalyzing(true)
    setCurrentAudienceId(audienceId)
    analysisInProgressRef.current = true
    
    try {
      if (audienceId === "meta") {
        // First, analyze for all regular audiences
        const regularResults: Array<{ id: string, name: string, result: string }> = []
        
        // Create an array of promises for parallel execution
        const analysisPromises = regularAudiences.map(async (audience) => {
          try {
            const result = await analyzeForAudience(audience.id)
            
            // Check if the analysis was cancelled
            if (!analysisInProgressRef.current) return null;
            
            // Only update if we have a valid result
            if (result) {
              regularResults.push({
                id: audience.id,
                name: audience.name,
                result
              })
              
              // Update the UI with each individual result as we get it
              setResults(prev => ({ ...prev, [audience.id]: result }))
            }
          } catch (error) {
            console.error(`Error analyzing for audience ${audience.name}:`, error)
            // Don't stop the whole process for one audience error
          }
        })
        
        // Wait for all analyses to complete
        await Promise.all(analysisPromises)
        
        // Check if the analysis was cancelled
        if (!analysisInProgressRef.current) return;
        
        // Then run the meta analysis with available results
        if (regularResults.length > 0) {
          const metaResult = await analyzeForAudience("meta", true, regularResults)
          if (metaResult) {
            setResults(prev => ({ ...prev, meta: metaResult }))
          }
        }
      } else {
        // Regular single audience analysis
        const result = await analyzeForAudience(audienceId)
        if (result) {
          setResults(prev => ({ ...prev, [audienceId]: result }))
        }
      }

      // Only show success message if the analysis wasn't cancelled
      if (analysisInProgressRef.current) {
        toast.success("Analysis completed")
      }
    } catch (error) {
      console.error('Error in handleAnalyze:', error)
      
      // Only show error if the analysis wasn't cancelled
      if (analysisInProgressRef.current) {
        toast.error(error instanceof Error ? error.message : "Failed to analyze message")
      }
    } finally {
      analysisInProgressRef.current = false
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