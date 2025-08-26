import type { SettingsConfig } from '../types';
/**
 * Settings manager with caching and environment fallback
 * Works in both Next.js and Lambda environments
 */
export declare class SettingsManager {
    private cache;
    private readonly cacheTTL;
    private dbQueryFunction?;
    constructor(dbQueryFunction?: (key: string) => Promise<string | null>);
    /**
     * Get setting value with caching and fallback to environment
     */
    getSetting(key: string): Promise<string | null>;
    /**
     * Get multiple settings at once
     */
    getSettings(keys: string[]): Promise<SettingsConfig>;
    /**
     * Get OpenAI configuration
     */
    getOpenAI(): Promise<{
        apiKey: string | null;
    }>;
    /**
     * Get Google configuration
     */
    getGoogle(): Promise<{
        apiKey: string | null;
    }>;
    /**
     * Get Azure configuration
     */
    getAzure(): Promise<{
        apiKey: string | null;
        endpoint: string | null;
    }>;
    /**
     * Get Bedrock configuration
     */
    getBedrock(): Promise<{
        accessKeyId?: string;
        secretAccessKey?: string;
        region: string;
    }>;
    /**
     * Clear cache
     */
    clearCache(): void;
    /**
     * Clear specific setting from cache
     */
    clearSetting(key: string): void;
}
/**
 * Default settings manager instance
 */
export declare const settingsManager: SettingsManager;
/**
 * Create settings manager with database query function
 */
export declare function createSettingsManager(dbQueryFunction: (key: string) => Promise<string | null>): SettingsManager;
