import { createLogger } from '@/lib/logger';

const log = createLogger({ module: 'circuit-breaker' });

/**
 * Circuit breaker states
 */
export enum CircuitBreakerState {
  CLOSED = 'closed',     // Normal operation
  OPEN = 'open',         // Failing fast
  HALF_OPEN = 'half-open' // Testing if service recovered
}

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  failureThreshold: number;      // Number of failures before opening
  recoveryTimeoutMs: number;     // Time to wait before attempting recovery
  monitoringPeriodMs: number;    // Window for failure counting
  successThreshold?: number;     // Successes needed to close from half-open
}

/**
 * Circuit breaker for AI provider resilience
 * Prevents cascade failures and provides fast failure when providers are down
 */
export class CircuitBreaker {
  private state: CircuitBreakerState = CircuitBreakerState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime = 0;
  private lastSuccessTime = 0;
  private failures: number[] = []; // Timestamps of failures
  private readonly config: Required<CircuitBreakerConfig>;

  constructor(config: CircuitBreakerConfig) {
    this.config = {
      successThreshold: 2,
      ...config
    };
    
    log.debug('Circuit breaker created', {
      failureThreshold: this.config.failureThreshold,
      recoveryTimeoutMs: this.config.recoveryTimeoutMs,
      monitoringPeriodMs: this.config.monitoringPeriodMs,
      successThreshold: this.config.successThreshold
    });
  }

  /**
   * Check if circuit breaker allows requests through
   */
  isOpen(): boolean {
    this.updateState();
    return this.state !== CircuitBreakerState.OPEN;
  }

  /**
   * Record a successful operation
   */
  recordSuccess(): void {
    this.lastSuccessTime = Date.now();

    if (this.state === CircuitBreakerState.HALF_OPEN) {
      this.successCount++;
      log.debug('Success recorded in half-open state', {
        successCount: this.successCount,
        threshold: this.config.successThreshold
      });

      if (this.successCount >= this.config.successThreshold) {
        this.reset();
        log.info('Circuit breaker closed after successful recovery');
      }
    } else if (this.state === CircuitBreakerState.CLOSED) {
      // Clear old failures on success
      this.cleanOldFailures();
      if (this.failureCount > 0) {
        log.debug('Resetting failure count after success');
        this.failureCount = 0;
      }
    }
  }

  /**
   * Record a failed operation
   */
  recordFailure(): void {
    const now = Date.now();
    this.lastFailureTime = now;
    this.failures.push(now);
    this.failureCount++;

    log.debug('Failure recorded', {
      failureCount: this.failureCount,
      threshold: this.config.failureThreshold,
      state: this.state
    });

    if (this.state === CircuitBreakerState.HALF_OPEN) {
      // Any failure in half-open immediately opens the circuit
      this.state = CircuitBreakerState.OPEN;
      log.warn('Circuit breaker opened due to failure in half-open state');
    } else if (this.state === CircuitBreakerState.CLOSED) {
      this.cleanOldFailures();
      const recentFailures = this.failures.length;
      
      if (recentFailures >= this.config.failureThreshold) {
        this.state = CircuitBreakerState.OPEN;
        log.error('Circuit breaker opened due to failure threshold exceeded', {
          recentFailures,
          threshold: this.config.failureThreshold
        });
      }
    }
  }

  /**
   * Get current circuit breaker state
   */
  getState(): CircuitBreakerState {
    this.updateState();
    return this.state;
  }

  /**
   * Get circuit breaker metrics
   */
  getMetrics(): {
    state: CircuitBreakerState;
    failureCount: number;
    successCount: number;
    lastFailureTime: number;
    lastSuccessTime: number;
    recentFailures: number;
  } {
    this.cleanOldFailures();
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      recentFailures: this.failures.length
    };
  }

  /**
   * Manually reset the circuit breaker to closed state
   */
  reset(): void {
    this.state = CircuitBreakerState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.failures = [];
    log.info('Circuit breaker manually reset to closed state');
  }

  /**
   * Update state based on time and current conditions
   */
  private updateState(): void {
    const now = Date.now();

    if (this.state === CircuitBreakerState.OPEN) {
      // Check if recovery timeout has elapsed
      if (now - this.lastFailureTime >= this.config.recoveryTimeoutMs) {
        this.state = CircuitBreakerState.HALF_OPEN;
        this.successCount = 0;
        log.info('Circuit breaker transitioned to half-open for recovery test');
      }
    }

    // Clean old failures regardless of state
    this.cleanOldFailures();
  }

  /**
   * Remove failures outside the monitoring window
   */
  private cleanOldFailures(): void {
    const now = Date.now();
    const cutoff = now - this.config.monitoringPeriodMs;
    const originalLength = this.failures.length;
    
    this.failures = this.failures.filter(timestamp => timestamp > cutoff);
    
    if (this.failures.length !== originalLength) {
      log.debug('Cleaned old failures', {
        removed: originalLength - this.failures.length,
        remaining: this.failures.length
      });
    }
  }
}

/**
 * Circuit breaker error for when requests are blocked
 */
export class CircuitBreakerOpenError extends Error {
  constructor(provider: string, state: CircuitBreakerState) {
    super(`Circuit breaker is ${state} for provider: ${provider}`);
    this.name = 'CircuitBreakerOpenError';
  }
}