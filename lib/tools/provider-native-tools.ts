import { createOpenAI } from '@ai-sdk/openai'
import { google } from '@ai-sdk/google'
import { Settings } from '@/lib/settings-manager'
import { createLogger } from '@/lib/logger'
import type { ToolSet } from 'ai'

const log = createLogger({ module: 'provider-native-tools' })

/**
 * Create provider-native tools based on the provider and enabled tools
 * This uses the AI SDK's built-in provider tools instead of custom implementations
 */
export async function createProviderNativeTools(
  provider: string,
  modelId: string,
  enabledTools: string[]
): Promise<ToolSet> {
  log.info('Creating provider native tools', {
    provider,
    modelId,
    enabledTools,
    enabledToolsCount: enabledTools.length
  });

  switch (provider.toLowerCase()) {
    case 'openai':
      return await createOpenAINativeTools(enabledTools)
    case 'google':
      return await createGoogleNativeTools(enabledTools)
    case 'amazon-bedrock':
      return await createBedrockNativeTools(enabledTools)
    default:
      log.warn(`No native tools available for provider: ${provider}`)
      return {}
  }
}

/**
 * Create OpenAI native tools using the AI SDK's built-in implementations
 */
async function createOpenAINativeTools(enabledTools: string[]): Promise<ToolSet> {
  const tools: Record<string, unknown> = {}

  try {
    const apiKey = await Settings.getOpenAI()
    if (!apiKey) {
      log.warn('OpenAI API key not configured, skipping native tools')
      return {}
    }

    const openai = createOpenAI({ apiKey })

    // Web search tool
    if (enabledTools.includes('webSearch')) {
      tools.web_search_preview = openai.tools.webSearchPreview({
        searchContextSize: 'high',
      })
      log.debug('Added OpenAI web search preview tool')
    }

    // Code interpreter tool - native OpenAI execution
    if (enabledTools.includes('codeInterpreter')) {
      tools.code_interpreter = openai.tools.codeInterpreter({})
      log.debug('Added OpenAI code interpreter tool')
    }

  } catch (error) {
    log.error('Failed to create OpenAI native tools', { error })
  }

  return tools as ToolSet
}

/**
 * Create Google native tools using the AI SDK's built-in implementations
 */
async function createGoogleNativeTools(enabledTools: string[]): Promise<ToolSet> {
  const tools: Record<string, unknown> = {}

  try {
    const apiKey = await Settings.getGoogleAI()
    if (!apiKey) {
      log.warn('Google API key not configured, skipping native tools')
      return {}
    }

    // Set environment variable for Google SDK
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = apiKey

    // Web search tool
    if (enabledTools.includes('webSearch')) {
      tools.google_search = google.tools.googleSearch({})
      log.debug('Added Google search tool')
    }

    // Code execution is built into Gemini models
    if (enabledTools.includes('codeInterpreter')) {
      log.debug('Code execution enabled - Gemini models have built-in support')
    }

  } catch (error) {
    log.error('Failed to create Google native tools', { error })
  }

  return tools as ToolSet
}

/**
 * Create Amazon Bedrock native tools (primarily for Claude models)
 * Note: Bedrock doesn't expose Anthropic's native tools - models run through Bedrock interface
 */
async function createBedrockNativeTools(enabledTools: string[]): Promise<ToolSet> {
  const tools: Record<string, unknown> = {}

  // Bedrock Claude models don't have access to Anthropic's native tools
  // They go through the Bedrock interface, which doesn't expose tools like web search
  if (enabledTools.includes('webSearch')) {
    log.info('Web search not available for Bedrock models - they use Bedrock interface, not Anthropic native tools')
  }

  if (enabledTools.includes('codeInterpreter')) {
    log.info('Code interpreter not available for Bedrock models - they use Bedrock interface, not Anthropic native tools')
  }

  return tools as ToolSet
}

/**
 * Check if a provider supports native tools
 */
export function providerSupportsNativeTools(provider: string, toolName: string): boolean {
  switch (provider.toLowerCase()) {
    case 'openai':
      return ['webSearch', 'codeInterpreter'].includes(toolName)
    case 'google':
      return ['webSearch'].includes(toolName)
    case 'amazon-bedrock':
      return false // No native tools via Bedrock SDK currently
    default:
      return false
  }
}