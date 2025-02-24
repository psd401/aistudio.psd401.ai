"use client"

import { useState } from "react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { PoliticalWordingResult, PoliticalWordingState } from "@/types"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"
import { Markdown } from "@/components/ui/markdown"
import { analyzePoliticalWordingAction } from "@/actions/db/political-wording-actions"
import { Progress } from "@/components/ui/progress"

export function PoliticalWording() {
  const [state, setState] = useState<PoliticalWordingState>({
    originalContent: "",
    results: [],
    isAnalyzing: false
  })

  const handleAnalyze = async () => {
    if (!state.originalContent) {
      toast.error("Please enter content to analyze")
      return
    }

    setState(prev => ({ ...prev, isAnalyzing: true }))

    try {
      // Initial Analysis
      setState(prev => ({ ...prev, currentStage: "initial" }))
      const initialResult = await analyzePoliticalWordingAction(
        state.originalContent,
        "initial"
      )

      if (!initialResult.isSuccess) {
        throw new Error(initialResult.message)
      }

      setState(prev => ({
        ...prev,
        results: [initialResult.data],
        currentStage: "context"
      }))

      // Context Analysis
      const contextResult = await analyzePoliticalWordingAction(
        state.originalContent,
        "context",
        [initialResult.data]
      )

      if (!contextResult.isSuccess) {
        throw new Error(contextResult.message)
      }

      setState(prev => ({
        ...prev,
        results: [...prev.results, contextResult.data],
        currentStage: "synthesis"
      }))

      // Final Synthesis
      const synthesisResult = await analyzePoliticalWordingAction(
        state.originalContent,
        "synthesis",
        [
          { stage: "initial", result: initialResult.data.content },
          { stage: "context", result: contextResult.data.content }
        ]
      )

      if (!synthesisResult.isSuccess) {
        throw new Error(synthesisResult.message)
      }

      setState(prev => ({
        ...prev,
        results: [...prev.results, synthesisResult.data],
        currentStage: undefined,
        isAnalyzing: false
      }))

      toast.success("Analysis completed")
    } catch (error) {
      console.error("Error in analysis:", error)
      toast.error(error instanceof Error ? error.message : "Failed to analyze content")
      setState(prev => ({ ...prev, isAnalyzing: false, currentStage: undefined }))
    }
  }

  const getStageLabel = (stage: string) => {
    switch (stage) {
      case "initial":
        return "Initial Analysis"
      case "context":
        return "Context Analysis"
      case "synthesis":
        return "Final Synthesis"
      default:
        return stage
    }
  }

  const getProgress = () => {
    if (!state.isAnalyzing) return 0
    switch (state.currentStage) {
      case "initial":
        return 33
      case "context":
        return 66
      case "synthesis":
        return 99
      default:
        return 0
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Political Wording Analysis</CardTitle>
          <CardDescription>
            Analyze your content for political context and implications
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            placeholder="Enter your content here..."
            value={state.originalContent}
            onChange={e =>
              setState(prev => ({ ...prev, originalContent: e.target.value }))
            }
            className="min-h-[200px]"
            disabled={state.isAnalyzing}
          />

          <div className="space-y-2">
            <Button
              onClick={handleAnalyze}
              disabled={state.isAnalyzing || !state.originalContent}
              className="w-full"
            >
              {state.isAnalyzing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {state.currentStage
                    ? `Running ${getStageLabel(state.currentStage)}...`
                    : "Analyzing..."}
                </>
              ) : (
                "Analyze Political Wording"
              )}
            </Button>

            {state.isAnalyzing && (
              <Progress value={getProgress()} className="h-2" />
            )}
          </div>
        </CardContent>
      </Card>

      {state.results.length > 0 && (
        <div className="space-y-4">
          {state.results.map((result, index) => (
            <Card key={index}>
              <CardHeader>
                <CardTitle>{getStageLabel(result.stage)}</CardTitle>
                <CardDescription>Using model: {result.model}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-lg bg-muted p-4">
                  <Markdown content={result.content} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
} 