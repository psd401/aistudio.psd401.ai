"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.settingsManager = exports.SettingsManager = void 0;
exports.createSettingsManager = createSettingsManager;
/**
 * Settings manager with caching and environment fallback
 * Works in both Next.js and Lambda environments
 */
class SettingsManager {
    cache = new Map();
    cacheTTL = 5 * 60 * 1000; // 5 minutes
    dbQueryFunction;
    constructor(dbQueryFunction) {
        this.dbQueryFunction = dbQueryFunction;
    }
    /**
     * Get setting value with caching and fallback to environment
     */
    async getSetting(key) {
        // Check cache first
        const cached = this.cache.get(key);
        if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
            return cached.value;
        }
        let value = null;
        // Try database first if available
        if (this.dbQueryFunction) {
            try {
                value = await this.dbQueryFunction(key);
            }
            catch (error) {
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
    async getSettings(keys) {
        const settings = {};
        await Promise.all(keys.map(async (key) => {
            const value = await this.getSetting(key);
            if (value) {
                settings[key] = value;
            }
        }));
        return settings;
    }
    /**
     * Get OpenAI configuration
     */
    async getOpenAI() {
        const apiKey = await this.getSetting('OPENAI_API_KEY');
        return { apiKey };
    }
    /**
     * Get Google configuration
     */
    async getGoogle() {
        const apiKey = await this.getSetting('GOOGLE_API_KEY');
        return { apiKey };
    }
    /**
     * Get Azure configuration
     */
    async getAzure() {
        const [apiKey, endpoint] = await Promise.all([
            this.getSetting('AZURE_OPENAI_KEY'),
            this.getSetting('AZURE_OPENAI_ENDPOINT')
        ]);
        return { apiKey, endpoint };
    }
    /**
     * Get Bedrock configuration
     */
    async getBedrock() {
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
    clearCache() {
        this.cache.clear();
    }
    /**
     * Clear specific setting from cache
     */
    clearSetting(key) {
        this.cache.delete(key);
    }
}
exports.SettingsManager = SettingsManager;
/**
 * Default settings manager instance
 */
exports.settingsManager = new SettingsManager();
/**
 * Create settings manager with database query function
 */
function createSettingsManager(dbQueryFunction) {
    return new SettingsManager(dbQueryFunction);
}
//# sourceMappingURL=settings-manager.js.map