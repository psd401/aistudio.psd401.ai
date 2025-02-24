import { SelectAiModel } from "@/db/schema"
import { SelectPoliticalContext, SelectPoliticalPrompt, SelectPoliticalSettings } from "@/db/schema"

export interface PoliticalWordingConfig {
  stage: "initial" | "context" | "synthesis"
  model: SelectAiModel | null
  prompt: SelectPoliticalPrompt | null
  context?: SelectPoliticalContext | null
}

export interface PoliticalWordingResult {
  stage: "initial" | "context" | "synthesis"
  content: string
  model: string
}

export interface PoliticalWordingState {
  originalContent: string
  results: PoliticalWordingResult[]
  isAnalyzing: boolean
  currentStage?: "initial" | "context" | "synthesis"
} 