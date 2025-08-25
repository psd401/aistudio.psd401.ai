import type { ToolSet } from 'ai'
import { executeSQL } from '@/lib/db/data-api-adapter'

// Note: Logger removed to avoid browser compatibility issues when imported client-side

export interface ModelCapabilities {
  webSearch: boolean
  codeInterpreter: boolean
  codeExecution: boolean
  grounding: boolean
  workspaceTools: boolean
  canvas: boolean
  artifacts: boolean
  thinking: boolean
  reasoning: boolean
  computerUse: boolean
  responsesAPI: boolean
  promptCaching: boolean
  contextCaching: boolean
}

// Define a basic tool type to avoid 'any'
export interface ToolDefinition {
  description: string
  parameters: {
    _input: unknown
    _output: unknown
  }
  execute?: (params: unknown) => Promise<unknown>
}

// Placeholder tool definition for provider-native tools
const createPlaceholderTool = (description: string): ToolDefinition => ({
  description,
  parameters: {
    _input: undefined,
    _output: undefined
  }
})

export interface ToolConfig {
  name: string
  tool: ToolDefinition
  requiredCapabilities: (keyof ModelCapabilities)[]
  displayName: string
  description: string
  category: 'search' | 'code' | 'analysis' | 'creative'
}

/**
 * Registry of all available tools with their capability requirements
 * Note: Actual tool implementations now use provider-native tools
 */
const TOOL_REGISTRY: Record<string, ToolConfig> = {
  webSearch: {
    name: 'webSearch',
    tool: createPlaceholderTool('Search the web for current information and facts'),
    requiredCapabilities: ['webSearch', 'grounding'],
    displayName: 'Web Search',
    description: 'Search the web for current information and facts',
    category: 'search'
  },
  codeInterpreter: {
    name: 'codeInterpreter', 
    tool: createPlaceholderTool('Execute code and perform data analysis'),
    requiredCapabilities: ['codeInterpreter', 'codeExecution'],
    displayName: 'Code Interpreter',
    description: 'Execute code and perform data analysis',
    category: 'code'
  }
}

/**
 * Get model capabilities from database (SERVER-SIDE ONLY)
 */
export async function getModelCapabilities(modelId: string): Promise<ModelCapabilities | null> {
  // Server-side only guard
  if (typeof window !== 'undefined') {
    throw new Error('getModelCapabilities can only be called server-side. Use client-tool-registry for client-side usage.')
  }
  try {
    // Validate modelId format before database query
    if (!modelId || typeof modelId !== 'string' || !/^[a-zA-Z0-9\-_.]+$/.test(modelId)) {
      return null
    }
    
    const result = await executeSQL(
      `SELECT nexus_capabilities 
       FROM ai_models 
       WHERE model_id = :modelId 
       AND active = true 
       LIMIT 1`,
      [{ name: 'modelId', value: { stringValue: modelId } }]
    )
    
    if (result.length === 0) {
      return null
    }
    
    const capabilities = result[0].nexusCapabilities || result[0].nexus_capabilities
    
    // JSONB fields should come back as objects, but handle string case too
    if (typeof capabilities === 'string') {
      return JSON.parse(capabilities) as ModelCapabilities
    }
    
    return capabilities as unknown as ModelCapabilities
  } catch {
    // Return null on error - error details available through proper logging 
    // in calling functions (server actions, API routes) that have access to logger
    return null
  }
}

/**
 * Get available tools for a specific model based on its capabilities (SERVER-SIDE ONLY)
 */
export async function getAvailableToolsForModel(modelId: string): Promise<ToolConfig[]> {
  // Server-side only guard
  if (typeof window !== 'undefined') {
    throw new Error('getAvailableToolsForModel can only be called server-side. Use client-tool-registry for client-side usage.')
  }
  const capabilities = await getModelCapabilities(modelId)
  if (!capabilities) {
    return []
  }
  
  return Object.values(TOOL_REGISTRY).filter(toolConfig => {
    // Check if model has ANY of the required capabilities (OR logic)
    return toolConfig.requiredCapabilities.some(capability => 
      capabilities[capability] === true
    )
  })
}

/**
 * Build tools object for AI SDK based on enabled tools and model capabilities
 * Now uses provider-native tool implementations
 */
export async function buildToolsForRequest(
  modelId: string,
  enabledTools: string[] = [],
  provider?: string
): Promise<ToolSet> {
  // If provider is specified, use native tools
  if (provider) {
    const { createProviderNativeTools } = await import('./provider-native-tools')
    return await createProviderNativeTools(provider, modelId, enabledTools)
  }

  // Fallback: return empty toolset if no provider specified
  // The legacy tool system is deprecated in favor of provider-native tools
  return {}
}

/**
 * Check if a specific tool is available for a model (SERVER-SIDE ONLY)
 */
export async function isToolAvailableForModel(
  modelId: string, 
  toolName: string
): Promise<boolean> {
  // Server-side only guard
  if (typeof window !== 'undefined') {
    throw new Error('isToolAvailableForModel can only be called server-side. Use client-tool-registry for client-side usage.')
  }
  const availableTools = await getAvailableToolsForModel(modelId)
  return availableTools.some(tool => tool.name === toolName)
}

/**
 * Get all registered tools (for UI rendering)
 */
export function getAllTools(): ToolConfig[] {
  return Object.values(TOOL_REGISTRY)
}

/**
 * Get tool configuration by name
 */
export function getToolConfig(toolName: string): ToolConfig | undefined {
  return TOOL_REGISTRY[toolName]
}

// Note: ToolConfig interface is already exported above, ModelCapabilities already exported above