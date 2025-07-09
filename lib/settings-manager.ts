import { getSettingValueAction } from "@/actions/db/settings-actions"
import logger from "@/lib/logger"

// Cache for settings to avoid repeated database queries
const settingsCache = new Map<string, { value: string | null; timestamp: number }>()
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

// Get a setting value with caching and fallback to environment variable
export async function getSetting(key: string): Promise<string | null> {
  // Check cache first
  const cached = settingsCache.get(key)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    // Cache hit
    return cached.value
  }

  try {
    // Try to get from database
    const dbValue = await getSettingValueAction(key)
    
    // Cache the result
    settingsCache.set(key, { value: dbValue, timestamp: Date.now() })
    
    if (dbValue !== null) {
      // Database value found
      return dbValue
    }
  } catch (error) {
    logger.error(`[SettingsManager] Error fetching setting ${key} from database:`, error)
  }

  // Fall back to environment variable
  const envValue = process.env[key] || null
  if (envValue) {
    // Falling back to env var
  } else {
    // No value found
  }
  
  return envValue
}

// Get multiple settings at once
export async function getSettings(keys: string[]): Promise<Record<string, string | null>> {
  const results: Record<string, string | null> = {}
  
  await Promise.all(
    keys.map(async (key) => {
      results[key] = await getSetting(key)
    })
  )
  
  return results
}

// Clear the cache (useful after updates)
export async function revalidateSettingsCache(key?: string) {
  if (key) {
    settingsCache.delete(key)
    // Cache cleared for key
  } else {
    settingsCache.clear()
    // Cache cleared
  }
  
  // Also clear S3 cache when settings are updated
  const { clearS3Cache } = await import("@/lib/aws/s3-client")
  clearS3Cache()
}

// Helper to get required setting (throws if not found)
export async function getRequiredSetting(key: string): Promise<string> {
  const value = await getSetting(key)
  if (!value) {
    throw new Error(`Required setting ${key} is not configured`)
  }
  return value
}

// Typed setting getters for common configurations
export const Settings = {
  // AI Providers
  async getAzureOpenAI() {
    const [key, endpoint, resourceName] = await Promise.all([
      getSetting('AZURE_OPENAI_KEY'),
      getSetting('AZURE_OPENAI_ENDPOINT'),
      getSetting('AZURE_OPENAI_RESOURCENAME')
    ])
    return { key, endpoint, resourceName }
  },

  async getBedrock() {
    const [accessKeyId, secretAccessKey, region] = await Promise.all([
      getSetting('BEDROCK_ACCESS_KEY_ID'),
      getSetting('BEDROCK_SECRET_ACCESS_KEY'),
      getSetting('BEDROCK_REGION')
    ])
    return { accessKeyId, secretAccessKey, region }
  },

  async getGoogleAI() {
    return getSetting('GOOGLE_API_KEY')
  },

  async getOpenAI() {
    return getSetting('OPENAI_API_KEY')
  },

  async getLatimer() {
    return getSetting('LATIMER_API_KEY')
  },

  async getGoogleVertex() {
    const [projectId, location, credentials] = await Promise.all([
      getSetting('GOOGLE_VERTEX_PROJECT_ID'),
      getSetting('GOOGLE_VERTEX_LOCATION'),
      getSetting('GOOGLE_APPLICATION_CREDENTIALS')
    ])
    return { projectId, location, credentials }
  },

  // Storage
  async getS3() {
    const [bucket, region] = await Promise.all([
      getSetting('S3_BUCKET'),
      getSetting('AWS_REGION')
    ])
    return { bucket, region }
  },

  // External Services
  async getGitHub() {
    return getSetting('GITHUB_ISSUE_TOKEN')
  }
}