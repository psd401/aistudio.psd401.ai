import type { SettingsConfig } from '../types';

/**
 * Settings manager with caching and environment fallback
 * Works in both Next.js and Lambda environments
 */
export class SettingsManager {
  private cache = new Map<string, { value: string | null; timestamp: number }>();
  private readonly cacheTTL = 5 * 60 * 1000; // 5 minutes
  private dbQueryFunction?: (key: string) => Promise<string | null>;
  
  constructor(dbQueryFunction?: (key: string) => Promise<string | null>) {
    this.dbQueryFunction = dbQueryFunction;
  }
  
  /**
   * Get setting value with caching and fallback to environment
   */
  async getSetting(key: string): Promise<string | null> {
    // Check cache first
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.value;
    }
    
    let value: string | null = null;
    
    // Try database first if available
    if (this.dbQueryFunction) {
      try {
        value = await this.dbQueryFunction(key);
      } catch (error) {
        console.warn(`Failed to get setting ${key} from database:`, error);
      }
    }
    
    // Fallback to environment variable
    if (!value) {
      value = process.env[key] || null;
    }
    
    // Cache the result
    this.cache.set(key, { value, timestamp: Date.now() });
    
    return value;
  }
  
  /**
   * Get multiple settings at once
   */
  async getSettings(keys: string[]): Promise<SettingsConfig> {
    const settings: SettingsConfig = {};
    
    await Promise.all(
      keys.map(async (key) => {
        const value = await this.getSetting(key);
        if (value) {
          (settings as any)[key] = value;
        }
      })
    );
    
    return settings;
  }
  
  /**
   * Get OpenAI configuration
   */
  async getOpenAI(): Promise<{ apiKey: string | null }> {
    const apiKey = await this.getSetting('OPENAI_API_KEY');
    return { apiKey };
  }
  
  /**
   * Get Google configuration
   */
  async getGoogle(): Promise<{ apiKey: string | null }> {
    const apiKey = await this.getSetting('GOOGLE_API_KEY');
    return { apiKey };
  }
  
  /**
   * Get Azure configuration
   */
  async getAzure(): Promise<{ 
    apiKey: string | null; 
    endpoint: string | null; 
  }> {
    const [apiKey, endpoint] = await Promise.all([
      this.getSetting('AZURE_OPENAI_KEY'),
      this.getSetting('AZURE_OPENAI_ENDPOINT')
    ]);
    
    return { apiKey, endpoint };
  }
  
  /**
   * Get Bedrock configuration
   */
  async getBedrock(): Promise<{
    accessKeyId?: string;
    secretAccessKey?: string;
    region: string;
  }> {
    const [accessKeyId, secretAccessKey, region] = await Promise.all([
      this.getSetting('AWS_ACCESS_KEY_ID'),
      this.getSetting('AWS_SECRET_ACCESS_KEY'),
      this.getSetting('AWS_REGION')
    ]);
    
    return {
      ...(accessKeyId && { accessKeyId }),
      ...(secretAccessKey && { secretAccessKey }),
      region: region || 'us-east-1'
    };
  }
  
  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }
  
  /**
   * Clear specific setting from cache
   */
  clearSetting(key: string): void {
    this.cache.delete(key);
  }
}

/**
 * Default settings manager instance
 */
export const settingsManager = new SettingsManager();

/**
 * Create settings manager with database query function
 */
export function createSettingsManager(
  dbQueryFunction: (key: string) => Promise<string | null>
): SettingsManager {
  return new SettingsManager(dbQueryFunction);
}