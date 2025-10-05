/**
 * Tool Name Mapping - Central registry for provider-specific tool names
 *
 * Provider-native tools execute on provider servers (OpenAI, Google, etc.) and
 * results stream back with provider-specific names. This mapping allows us to:
 * 1. Keep friendly names in the UI for users
 * 2. Map to provider-specific names for tool execution
 * 3. Support multiple providers with the same logical tool
 */

export interface ToolNameMapping {
  friendly: string
  openai: string | null
  google: string | null
  bedrock: string | null
}

export const TOOL_NAME_MAPPING: Record<string, ToolNameMapping> = {
  webSearch: {
    friendly: 'webSearch',
    openai: 'web_search_preview',
    google: 'google_search',
    bedrock: null, // Not available via Bedrock SDK
  },
  codeInterpreter: {
    friendly: 'codeInterpreter',
    openai: 'code_interpreter',
    google: null, // Built into Gemini models
    bedrock: null, // Not available via Bedrock SDK
  },
  generateImage: {
    friendly: 'generateImage',
    openai: null, // Handled separately via image generation models
    google: null,
    bedrock: null,
  },
} as const

/**
 * Get the provider-specific tool name for a friendly name
 */
export function getProviderToolName(
  friendlyName: string,
  provider: string
): string | null {
  const mapping = TOOL_NAME_MAPPING[friendlyName]
  if (!mapping) return null

  const providerKey = provider.toLowerCase().replace('amazon-', '') as keyof Omit<ToolNameMapping, 'friendly'>
  return mapping[providerKey] || null
}

/**
 * Get the friendly name from a provider-specific tool name
 */
export function getFriendlyToolName(providerToolName: string): string | null {
  for (const [friendlyName, mapping] of Object.entries(TOOL_NAME_MAPPING)) {
    if (
      mapping.openai === providerToolName ||
      mapping.google === providerToolName ||
      mapping.bedrock === providerToolName ||
      mapping.friendly === providerToolName
    ) {
      return friendlyName
    }
  }
  return null
}

/**
 * Get all tool names (both friendly and provider-specific) for UI registration
 * This allows a single ToolUI component to match multiple provider tool names
 */
export function getAllToolNamesForUI(friendlyName: string): string[] {
  const mapping = TOOL_NAME_MAPPING[friendlyName]
  if (!mapping) return [friendlyName]

  const names = [mapping.friendly]

  if (mapping.openai) names.push(mapping.openai)
  if (mapping.google) names.push(mapping.google)
  if (mapping.bedrock) names.push(mapping.bedrock)

  return names
}

/**
 * Check if a tool is available for a specific provider
 */
export function isToolAvailableForProvider(
  friendlyName: string,
  provider: string
): boolean {
  return getProviderToolName(friendlyName, provider) !== null
}

/**
 * Get all provider-specific tool names for a list of friendly names
 */
export function getProviderToolNames(
  friendlyNames: string[],
  provider: string
): string[] {
  return friendlyNames
    .map(name => getProviderToolName(name, provider))
    .filter((name): name is string => name !== null)
}
