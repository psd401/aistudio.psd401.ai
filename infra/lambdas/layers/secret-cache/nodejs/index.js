"use strict";
/**
 * Secret Cache Layer for AWS Lambda
 *
 * Provides in-memory caching for AWS Secrets Manager secrets to improve
 * Lambda performance and reduce API calls.
 *
 * Features:
 * - In-memory caching with configurable TTL
 * - Automatic cache invalidation on rotation
 * - Fallback to expired cache on fetch failures
 * - Version tracking for cache validation
 * - Singleton pattern for Lambda container reuse
 *
 * @packageDocumentation
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getApiKeySecret = exports.getDatabaseSecret = exports.invalidateSecret = exports.getSecret = exports.SecretCache = void 0;
const client_secrets_manager_1 = require("@aws-sdk/client-secrets-manager");
/**
 * Simple logging utility for Lambda Layer
 *
 * EXCEPTION TO CLAUDE.md LOGGING RULES:
 * Lambda layers cannot use path aliases like @/lib/logger because:
 * 1. Layers are packaged separately from the main application
 * 2. TypeScript path mappings don't resolve at runtime in layers
 * 3. Layers must be self-contained with no external dependencies
 *
 * Therefore, this layer uses console methods directly as the only viable option.
 * This is an explicit, documented exception to the "no console.log" rule.
 *
 * @see CLAUDE.md - Logging rules
 * @see PR #420 review feedback
 */
const log = {
    info: (...args) => console.log('[SecretCache]', ...args),
    warn: (...args) => console.warn('[SecretCache]', ...args),
    error: (...args) => console.error('[SecretCache]', ...args)
};
/**
 * Generate a simple request ID for tracking
 */
const generateRequestId = () => `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
/**
 * Secret Cache implementation for AWS Lambda
 *
 * Caches secrets in memory to reduce latency and API calls.
 * Cache persists across Lambda invocations within the same container.
 *
 * @example
 * ```typescript
 * const cache = SecretCache.getInstance()
 * const dbConfig = await cache.getSecret('aistudio/prod/database')
 * ```
 */
class SecretCache {
    constructor(options = {}) {
        this.cache = new Map();
        this.ttl = options.ttl || 3600000; // 1 hour default
        this.enableDebugLogging = options.enableDebugLogging || false;
        this.client = new client_secrets_manager_1.SecretsManagerClient({
            region: options.region || process.env.AWS_REGION,
            maxAttempts: 3,
        });
        if (this.enableDebugLogging) {
            log.info("SecretCache initialized", {
                ttl: this.ttl,
                region: options.region || process.env.AWS_REGION,
            });
        }
    }
    /**
     * Gets the singleton instance of SecretCache
     *
     * @param options - Configuration options (only used on first call)
     * @returns The singleton SecretCache instance
     */
    static getInstance(options) {
        if (!SecretCache.instance) {
            SecretCache.instance = new SecretCache(options);
        }
        return SecretCache.instance;
    }
    /**
     * Retrieves a secret from cache or Secrets Manager
     *
     * @param secretId - The ARN or name of the secret
     * @param versionId - Optional specific version to retrieve
     * @returns The secret value (parsed JSON if applicable)
     * @throws Error if secret cannot be retrieved and no cached value exists
     */
    async getSecret(secretId, versionId) {
        const requestId = generateRequestId();
        const cacheKey = versionId ? `${secretId}:${versionId}` : secretId;
        // Check cache
        const cached = this.cache.get(cacheKey);
        if (cached && cached.expiry > Date.now()) {
            if (this.enableDebugLogging) {
                log.info("Secret retrieved from cache", {
                    requestId,
                    secretId,
                    version: cached.version,
                    age: Date.now() - cached.lastFetched,
                });
            }
            return cached.value;
        }
        // Fetch from Secrets Manager
        try {
            const response = await this.fetchSecret(secretId, versionId);
            const value = this.parseSecretValue(response);
            const version = response.VersionId || "unknown";
            // Update cache
            this.cache.set(cacheKey, {
                value,
                expiry: Date.now() + this.ttl,
                version,
                lastFetched: Date.now(),
            });
            log.info("Secret fetched and cached", {
                requestId,
                secretId,
                version,
            });
            return value;
        }
        catch (error) {
            log.error("Failed to retrieve secret", {
                requestId,
                secretId,
                error: error instanceof Error
                    ? { message: error.message, name: error.name }
                    : String(error),
            });
            // Return cached value if available (even if expired)
            if (cached) {
                log.warn("Returning expired cached secret due to fetch failure", {
                    requestId,
                    secretId,
                    age: Date.now() - cached.lastFetched,
                });
                return cached.value;
            }
            throw error;
        }
    }
    /**
     * Fetches secret from AWS Secrets Manager
     */
    async fetchSecret(secretId, versionId) {
        const command = new client_secrets_manager_1.GetSecretValueCommand({
            SecretId: secretId,
            VersionId: versionId,
        });
        return this.client.send(command);
    }
    /**
     * Parses secret value from response
     */
    parseSecretValue(response) {
        if (response.SecretString) {
            try {
                return JSON.parse(response.SecretString);
            }
            catch {
                // Not JSON, return as string
                return response.SecretString;
            }
        }
        if (response.SecretBinary) {
            return response.SecretBinary;
        }
        throw new Error("Secret value is empty");
    }
    /**
     * Invalidates cached secret(s)
     *
     * @param secretId - Optional specific secret to invalidate. If not provided, clears entire cache.
     */
    invalidate(secretId) {
        if (secretId) {
            // Invalidate specific secret and all its versions
            const keysToDelete = [];
            for (const key of this.cache.keys()) {
                if (key === secretId || key.startsWith(`${secretId}:`)) {
                    keysToDelete.push(key);
                }
            }
            keysToDelete.forEach((key) => this.cache.delete(key));
            if (this.enableDebugLogging) {
                log.info("Secret invalidated from cache", {
                    secretId,
                    versionsInvalidated: keysToDelete.length,
                });
            }
        }
        else {
            // Clear entire cache
            this.cache.clear();
            if (this.enableDebugLogging) {
                log.info("Entire cache cleared");
            }
        }
    }
    /**
     * Gets cache statistics for monitoring
     *
     * @returns Cache statistics including size and hit/miss ratios
     */
    getStats() {
        const entries = Array.from(this.cache.entries()).map(([secretId, cached]) => ({
            secretId,
            version: cached.version,
            age: Date.now() - cached.lastFetched,
        }));
        return {
            size: this.cache.size,
            entries,
        };
    }
    /**
     * Handles rotation event from EventBridge
     * Automatically invalidates the rotated secret
     *
     * @param event - EventBridge event from Secrets Manager rotation
     */
    handleRotationEvent(event) {
        const secretArn = event.detail?.secretArn;
        if (!secretArn) {
            log.warn("Rotation event missing secretArn", { event });
            return;
        }
        log.info("Handling rotation event", {
            secretArn,
            eventName: event.detail?.eventName,
        });
        this.invalidate(secretArn);
    }
}
exports.SecretCache = SecretCache;
/**
 * Convenience function to get a secret using the singleton cache
 *
 * @param secretId - The ARN or name of the secret
 * @param versionId - Optional specific version to retrieve
 * @returns The secret value
 *
 * @example
 * ```typescript
 * const dbPassword = await getSecret('aistudio/prod/db-password')
 * const apiKey = await getSecret('aistudio/prod/openai-key')
 * ```
 */
const getSecret = async (secretId, versionId) => {
    const cache = SecretCache.getInstance();
    return cache.getSecret(secretId, versionId);
};
exports.getSecret = getSecret;
/**
 * Convenience function to invalidate cached secret(s)
 *
 * @param secretId - Optional specific secret to invalidate
 *
 * @example
 * ```typescript
 * // Invalidate specific secret
 * invalidateSecret('aistudio/prod/db-password')
 *
 * // Invalidate all secrets
 * invalidateSecret()
 * ```
 */
const invalidateSecret = (secretId) => {
    const cache = SecretCache.getInstance();
    cache.invalidate(secretId);
};
exports.invalidateSecret = invalidateSecret;
/**
 * Type-safe helper to get database secret
 *
 * @param secretId - The secret ID
 * @returns Parsed database secret
 */
const getDatabaseSecret = async (secretId) => {
    const secret = await (0, exports.getSecret)(secretId);
    if (typeof secret === "object" &&
        secret !== null &&
        "username" in secret &&
        "password" in secret) {
        return secret;
    }
    const actualType = secret === null ? "null" : typeof secret;
    throw new Error(`Secret "${secretId}" is not in expected database format. ` +
        `Expected object with 'username' and 'password' fields, got ${actualType}. ` +
        `Ensure the secret contains a JSON object with these required fields.`);
};
exports.getDatabaseSecret = getDatabaseSecret;
/**
 * Type-safe helper to get API key secret
 *
 * @param secretId - The secret ID
 * @returns API key as string
 */
const getApiKeySecret = async (secretId) => {
    const secret = await (0, exports.getSecret)(secretId);
    if (typeof secret === "string") {
        return secret;
    }
    if (typeof secret === "object" && secret !== null && "apiKey" in secret) {
        return secret.apiKey;
    }
    const actualType = secret === null ? "null" : typeof secret;
    const hasApiKey = typeof secret === "object" && secret !== null && "apiKey" in secret;
    throw new Error(`Secret "${secretId}" is not in expected API key format. ` +
        `Expected a string or object with 'apiKey' field, got ${actualType}` +
        (typeof secret === "object" && secret !== null && !hasApiKey
            ? `. Available fields: ${Object.keys(secret).join(", ")}`
            : "") +
        `. Ensure the secret contains either a plain string API key or a JSON object with an 'apiKey' field.`);
};
exports.getApiKeySecret = getApiKeySecret;
