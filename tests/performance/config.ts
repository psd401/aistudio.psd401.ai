/**
 * Performance Testing Configuration
 *
 * Defines test targets, thresholds, and environment-specific settings
 * for streaming performance validation.
 */

export interface PerformanceTargets {
  /** Time-to-first-token in milliseconds (p95 percentile) */
  ttftP95: number;
  /** Time-to-first-token in milliseconds (p99 percentile) */
  ttftP99: number;
  /** Maximum acceptable error rate (percentage) */
  maxErrorRate: number;
  /** Minimum concurrent streams that must be supported */
  minConcurrentStreams: number;
  /** Maximum acceptable memory growth per hour (MB) */
  maxMemoryGrowthMB: number;
  /** Minimum tokens per second */
  minTokensPerSecond: number;
}

export interface TestEnvironment {
  /** Base URL for API endpoints */
  baseUrl: string;
  /** Authentication token or credentials */
  authToken?: string;
  /** Test user credentials */
  testUser?: {
    email: string;
    password: string;
  };
}

export interface ModelTestConfig {
  /** Model ID to test */
  modelId: string;
  /** Provider name */
  provider: string;
  /** Expected TTFT range (for validation) */
  expectedTtftRange?: {
    min: number;
    max: number;
  };
}

/**
 * Performance targets based on issue #311 acceptance criteria
 */
export const PERFORMANCE_TARGETS: PerformanceTargets = {
  ttftP95: 1000, // <1 second for 95th percentile
  ttftP99: 2000, // <2 seconds for 99th percentile (buffer)
  maxErrorRate: 0.5, // <0.5% error rate
  minConcurrentStreams: 100, // Support 100+ concurrent streams
  maxMemoryGrowthMB: 100, // Max 100MB growth per hour
  minTokensPerSecond: 10, // Minimum 10 tokens/sec throughput
};

/**
 * Environment configurations
 */
export const ENVIRONMENTS: Record<string, TestEnvironment> = {
  local: {
    baseUrl: 'http://localhost:3000',
  },
  staging: {
    baseUrl: process.env.STAGING_URL || 'https://staging.aistudio.psd401.ai',
  },
  production: {
    baseUrl: process.env.PRODUCTION_URL || 'https://aistudio.psd401.ai',
  },
};

/**
 * Models to test across different providers
 */
export const TEST_MODELS: ModelTestConfig[] = [
  {
    modelId: 'gpt-4o',
    provider: 'openai',
    expectedTtftRange: { min: 200, max: 800 },
  },
  {
    modelId: 'gpt-4o-mini',
    provider: 'openai',
    expectedTtftRange: { min: 150, max: 600 },
  },
  {
    modelId: 'claude-3-5-sonnet-20241022',
    provider: 'anthropic',
    expectedTtftRange: { min: 300, max: 1000 },
  },
  {
    modelId: 'gemini-2.0-flash-exp',
    provider: 'google',
    expectedTtftRange: { min: 250, max: 900 },
  },
];

/**
 * Test prompts of varying complexity
 */
export const TEST_PROMPTS = {
  short: 'Hello! How are you?',
  medium: 'Explain the concept of streaming in web applications and why it\'s beneficial for real-time AI responses.',
  long: 'Write a comprehensive essay about the evolution of artificial intelligence from the 1950s to today, covering major milestones, key researchers, technological breakthroughs, ethical considerations, and future implications for society. Include specific examples and cite important papers where relevant.',
  veryLong: 'Provide a detailed technical analysis of modern transformer architectures in natural language processing. Cover the attention mechanism, positional encodings, layer normalization, feed-forward networks, and multi-head attention. Then explain how these components work together in models like GPT, BERT, and T5. Include mathematical formulations, implementation considerations, training strategies, and performance characteristics. Finally, discuss recent innovations like sparse attention, mixture of experts, and retrieval-augmented generation.',
};

/**
 * Test configuration for different test types
 */
export const TEST_CONFIG = {
  /** Concurrent streaming test configuration */
  concurrent: {
    /** Number of concurrent streams to test */
    streamCount: 100,
    /** Ramp-up time in milliseconds */
    rampUpMs: 5000,
    /** Test duration in milliseconds */
    durationMs: 60000,
  },
  /** Long-running stream test configuration */
  longRunning: {
    /** Minimum duration in milliseconds (15 minutes) */
    minDurationMs: 15 * 60 * 1000,
    /** Maximum duration in milliseconds (30 minutes) */
    maxDurationMs: 30 * 60 * 1000,
    /** Memory check interval in milliseconds */
    memoryCheckIntervalMs: 60000,
  },
  /** Memory leak detection configuration */
  memoryLeak: {
    /** Test duration in milliseconds (1 hour) */
    durationMs: 60 * 60 * 1000,
    /** Heap snapshot interval in milliseconds */
    snapshotIntervalMs: 5 * 60 * 1000,
    /** Number of concurrent streams during test */
    concurrentStreams: 10,
  },
  /** Stress test configuration */
  stress: {
    /** Starting number of users */
    startUsers: 1,
    /** Maximum number of users */
    maxUsers: 200,
    /** User increment per step */
    userIncrement: 10,
    /** Duration per step in milliseconds */
    stepDurationMs: 30000,
  },
};

/**
 * Get current test environment
 */
export function getTestEnvironment(): TestEnvironment {
  const env = process.env.TEST_ENV || 'local';
  return ENVIRONMENTS[env] || ENVIRONMENTS.local;
}

/**
 * Get performance targets (can be overridden by environment)
 */
export function getPerformanceTargets(): PerformanceTargets {
  return {
    ...PERFORMANCE_TARGETS,
    // Allow overrides from environment variables
    ttftP95: Number(process.env.PERF_TTFT_P95) || PERFORMANCE_TARGETS.ttftP95,
    ttftP99: Number(process.env.PERF_TTFT_P99) || PERFORMANCE_TARGETS.ttftP99,
    maxErrorRate: Number(process.env.PERF_MAX_ERROR_RATE) || PERFORMANCE_TARGETS.maxErrorRate,
  };
}
