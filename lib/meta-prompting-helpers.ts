import { generateCompletion } from '@/lib/ai-helpers'
import { SelectMetaPromptingTechnique, SelectMetaPromptingTemplate } from '@/db/schema'

export interface MetaPromptingConfig {
  technique: SelectMetaPromptingTechnique
  template?: SelectMetaPromptingTemplate
  variables?: Record<string, string>
}

export async function generateMetaPrompt(
  config: MetaPromptingConfig,
  input: string
): Promise<string> {
  const { technique, template, variables } = config
  
  // If we have a template, use it to format the system prompt
  let systemPrompt = template 
    ? formatTemplate(template.template, variables || {})
    : getDefaultSystemPrompt(technique.type)
    
  // Add technique context to system prompt
  systemPrompt = `${systemPrompt}\n\nTechnique Context:\n${technique.description}\n\nExample:\n${technique.example}`
  
  if (technique.exampleInput && technique.exampleOutput) {
    systemPrompt += `\n\nExample Input:\n${technique.exampleInput}\n\nExample Output:\n${technique.exampleOutput}`
  }

  // Get model configuration from technique
  const modelConfig = {
    provider: 'amazon-bedrock', // Default to Bedrock, can be made dynamic
    modelId: 'anthropic.claude-3-sonnet-20240229-v1:0' // Default to Claude 3 Sonnet, can be made dynamic
  }

  return generateCompletion(modelConfig, systemPrompt, input)
}

function getDefaultSystemPrompt(type: string): string {
  const prompts: Record<string, string> = {
    prompt_generation: "You are an expert at crafting effective prompts. Help the user create a clear, specific, and well-structured prompt that will achieve their goal.",
    iterative_refinement: "You are an expert at improving prompts. Analyze the user's prompt and suggest specific improvements to enhance clarity, specificity, and effectiveness.",
    feedback: "You are an expert at analyzing prompts. Review the user's prompt and provide detailed feedback on clarity, specificity, potential issues, and areas for improvement.",
    role_reversal: "You are taking the perspective of the target audience. Analyze the prompt from their viewpoint and identify potential misunderstandings or missing context.",
    bot_to_bot: "You are an expert at coordinating multiple AI models. Help create effective prompts that build upon previous model outputs.",
    meta_questioning: "You are an expert at exploring assumptions and context. Help identify and gather the necessary details to create more effective prompts."
  }
  
  return prompts[type] || prompts.prompt_generation
}

function formatTemplate(template: string, variables: Record<string, string>): string {
  let result = template
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`{{${key}}}`, 'g'), value)
  }
  return result
} 