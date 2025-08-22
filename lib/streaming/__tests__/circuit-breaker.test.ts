import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { CircuitBreaker, CircuitBreakerState, CircuitBreakerOpenError } from '../circuit-breaker';

// Mock logger
jest.mock('@/lib/logger', () => ({
  createLogger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  })
}));

describe('CircuitBreaker', () => {
  let circuitBreaker: CircuitBreaker;
  
  beforeEach(() => {
    jest.useFakeTimers();
    circuitBreaker = new CircuitBreaker({
      failureThreshold: 3,
      recoveryTimeoutMs: 5000,
      monitoringPeriodMs: 10000,
      successThreshold: 2
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('initial state', () => {
    it('should start in closed state', () => {
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED);
      expect(circuitBreaker.isOpen()).toBe(false); // Circuit is closed (not open)
    });

    it('should have zero failures initially', () => {
      const metrics = circuitBreaker.getMetrics();
      expect(metrics.failureCount).toBe(0);
      expect(metrics.successCount).toBe(0);
      expect(metrics.recentFailures).toBe(0);
    });
  });

  describe('failure handling', () => {
    it('should remain closed with failures below threshold', () => {
      circuitBreaker.recordFailure();
      circuitBreaker.recordFailure();
      
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED);
      expect(circuitBreaker.isOpen()).toBe(false);
    });

    it('should open when failure threshold is reached', () => {
      circuitBreaker.recordFailure();
      circuitBreaker.recordFailure();
      circuitBreaker.recordFailure(); // Should trigger open state
      
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN);
      expect(circuitBreaker.isOpen()).toBe(true); // Circuit is open (blocks requests)
    });

    it('should track failure metrics correctly', () => {
      circuitBreaker.recordFailure();
      circuitBreaker.recordFailure();
      
      const metrics = circuitBreaker.getMetrics();
      expect(metrics.failureCount).toBe(2);
      expect(metrics.recentFailures).toBe(2);
      expect(metrics.lastFailureTime).toBeGreaterThan(0);
    });
  });

  describe('recovery handling', () => {
    beforeEach(() => {
      // Open the circuit breaker
      circuitBreaker.recordFailure();
      circuitBreaker.recordFailure();
      circuitBreaker.recordFailure();
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN);
    });

    it('should transition to half-open after recovery timeout', () => {
      // Advance time past recovery timeout
      jest.advanceTimersByTime(6000);
      
      // Check state should now be half-open
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.HALF_OPEN);
      expect(circuitBreaker.isOpen()).toBe(false); // Half-open allows limited requests
    });

    it('should close circuit after successful recovery', () => {
      // Advance time past recovery timeout
      jest.advanceTimersByTime(6000);
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.HALF_OPEN);
      
      // Record successful operations
      circuitBreaker.recordSuccess();
      circuitBreaker.recordSuccess(); // Should close the circuit
      
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED);
      expect(circuitBreaker.isOpen()).toBe(false);
    });

    it('should reopen circuit if failure occurs in half-open state', () => {
      // Advance time past recovery timeout
      jest.advanceTimersByTime(6000);
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.HALF_OPEN);
      
      // Record a failure in half-open state
      circuitBreaker.recordFailure();
      
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN);
      expect(circuitBreaker.isOpen()).toBe(false);
    });
  });

  describe('monitoring window', () => {
    it('should clean old failures outside monitoring window', () => {
      // Record failures
      circuitBreaker.recordFailure();
      circuitBreaker.recordFailure();
      
      expect(circuitBreaker.getMetrics().recentFailures).toBe(2);
      
      // Advance time past monitoring period
      jest.advanceTimersByTime(11000);
      
      // Check that old failures are cleaned up
      const metrics = circuitBreaker.getMetrics();
      expect(metrics.recentFailures).toBe(0);
    });

    it('should reset failure count on success in closed state', () => {
      circuitBreaker.recordFailure();
      circuitBreaker.recordFailure();
      
      expect(circuitBreaker.getMetrics().failureCount).toBe(2);
      
      circuitBreaker.recordSuccess();
      
      expect(circuitBreaker.getMetrics().failureCount).toBe(0);
    });
  });

  describe('manual reset', () => {
    it('should reset to closed state when manually reset', () => {
      // Open the circuit
      circuitBreaker.recordFailure();
      circuitBreaker.recordFailure();
      circuitBreaker.recordFailure();
      
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN);
      
      // Manual reset
      circuitBreaker.reset();
      
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED);
      expect(circuitBreaker.isOpen()).toBe(false);
      
      const metrics = circuitBreaker.getMetrics();
      expect(metrics.failureCount).toBe(0);
      expect(metrics.successCount).toBe(0);
      expect(metrics.recentFailures).toBe(0);
    });
  });

  describe('configuration edge cases', () => {
    it('should handle zero failure threshold', () => {
      const cb = new CircuitBreaker({
        failureThreshold: 0,
        recoveryTimeoutMs: 1000,
        monitoringPeriodMs: 5000
      });
      
      expect(cb.getState()).toBe(CircuitBreakerState.CLOSED);
      
      cb.recordFailure();
      
      // Should open immediately with zero threshold
      expect(cb.getState()).toBe(CircuitBreakerState.OPEN);
    });

    it('should handle very short recovery timeout', () => {
      const cb = new CircuitBreaker({
        failureThreshold: 1,
        recoveryTimeoutMs: 10, // Very short
        monitoringPeriodMs: 5000
      });
      
      cb.recordFailure();
      expect(cb.getState()).toBe(CircuitBreakerState.OPEN);
      
      // Advance time briefly
      jest.advanceTimersByTime(20);
      
      expect(cb.getState()).toBe(CircuitBreakerState.HALF_OPEN);
    });
  });
});

describe('CircuitBreakerOpenError', () => {
  it('should create error with provider and state', () => {
    const error = new CircuitBreakerOpenError('openai', CircuitBreakerState.OPEN);
    
    expect(error.name).toBe('CircuitBreakerOpenError');
    expect(error.message).toBe('Circuit breaker is open for provider: openai');
  });
});