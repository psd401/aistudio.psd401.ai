/**
 * Metrics Collector for Performance Testing
 *
 * Aggregates metrics from multiple stream requests and calculates
 * statistical measures like percentiles, averages, and distributions.
 */

import type { StreamMetrics } from './stream-client';

export interface AggregatedMetrics {
  /** Total number of requests */
  totalRequests: number;
  /** Number of successful requests */
  successfulRequests: number;
  /** Number of failed requests */
  failedRequests: number;
  /** Error rate (percentage) */
  errorRate: number;
  /** Number of connection drops */
  connectionDrops: number;

  /** Time-to-first-token statistics (ms) */
  ttft: {
    min: number;
    max: number;
    mean: number;
    median: number;
    p95: number;
    p99: number;
  };

  /** Total response time statistics (ms) */
  responseTime: {
    min: number;
    max: number;
    mean: number;
    median: number;
    p95: number;
    p99: number;
  };

  /** Throughput statistics (tokens/sec) */
  throughput: {
    min: number;
    max: number;
    mean: number;
    median: number;
  };

  /** Token count statistics */
  tokens: {
    min: number;
    max: number;
    mean: number;
    total: number;
  };

  /** Memory usage statistics (bytes) */
  memory: {
    startMin: number;
    startMax: number;
    startMean: number;
    endMin: number;
    endMax: number;
    endMean: number;
    growth: number;
  };

  /** Test duration information */
  duration: {
    startTime: number;
    endTime: number;
    totalMs: number;
  };

  /** Individual request metrics */
  requests: StreamMetrics[];
}

export class MetricsCollector {
  private metrics: StreamMetrics[] = [];
  private startTime: number;
  private endTime?: number;

  constructor() {
    this.startTime = Date.now();
  }

  /**
   * Add a metric to the collection
   */
  add(metric: StreamMetrics): void {
    this.metrics.push(metric);
    this.endTime = Date.now();
  }

  /**
   * Add multiple metrics to the collection
   */
  addBatch(metrics: StreamMetrics[]): void {
    this.metrics.push(...metrics);
    this.endTime = Date.now();
  }

  /**
   * Get aggregated metrics
   */
  getAggregated(): AggregatedMetrics {
    const totalRequests = this.metrics.length;
    const successfulRequests = this.metrics.filter(m => m.success).length;
    const failedRequests = totalRequests - successfulRequests;
    const errorRate = totalRequests > 0 ? (failedRequests / totalRequests) * 100 : 0;
    const connectionDrops = this.metrics.filter(m => m.connectionDropped).length;

    // Extract values for calculations (only successful requests)
    const successfulMetrics = this.metrics.filter(m => m.success && m.timeToFirstToken > 0);
    const ttftValues = successfulMetrics.map(m => m.timeToFirstToken);
    const responseTimeValues = successfulMetrics.map(m => m.totalResponseTime);
    const throughputValues = successfulMetrics.map(m => m.tokensPerSecond).filter(v => v > 0);
    const tokenValues = successfulMetrics.map(m => m.tokenCount);
    const memoryStartValues = this.metrics.map(m => m.memoryStart || 0).filter(v => v > 0);
    const memoryEndValues = this.metrics.map(m => m.memoryEnd || 0).filter(v => v > 0);

    return {
      totalRequests,
      successfulRequests,
      failedRequests,
      errorRate,
      connectionDrops,

      ttft: this.calculateStats(ttftValues),
      responseTime: this.calculateStats(responseTimeValues),
      throughput: this.calculateStats(throughputValues),
      tokens: {
        ...this.calculateStats(tokenValues),
        total: tokenValues.reduce((sum, v) => sum + v, 0),
      },
      memory: {
        startMin: Math.min(...memoryStartValues),
        startMax: Math.max(...memoryStartValues),
        startMean: this.mean(memoryStartValues),
        endMin: Math.min(...memoryEndValues),
        endMax: Math.max(...memoryEndValues),
        endMean: this.mean(memoryEndValues),
        growth: this.mean(memoryEndValues) - this.mean(memoryStartValues),
      },
      duration: {
        startTime: this.startTime,
        endTime: this.endTime || Date.now(),
        totalMs: (this.endTime || Date.now()) - this.startTime,
      },
      requests: this.metrics,
    };
  }

  /**
   * Calculate statistical measures for a set of values
   */
  private calculateStats(values: number[]): {
    min: number;
    max: number;
    mean: number;
    median: number;
    p95: number;
    p99: number;
  } {
    if (values.length === 0) {
      return { min: 0, max: 0, mean: 0, median: 0, p95: 0, p99: 0 };
    }

    const sorted = [...values].sort((a, b) => a - b);

    return {
      min: sorted[0],
      max: sorted[sorted.length - 1],
      mean: this.mean(values),
      median: this.percentile(sorted, 50),
      p95: this.percentile(sorted, 95),
      p99: this.percentile(sorted, 99),
    };
  }

  /**
   * Calculate mean of values
   */
  private mean(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  }

  /**
   * Calculate percentile of sorted values using nearest-rank method
   */
  private percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;

    // Handle edge cases
    if (p === 0) return sorted[0];
    if (p === 100) return sorted[sorted.length - 1];

    // Standard nearest-rank method: floor((p/100) * (n-1))
    const index = Math.floor((p / 100) * (sorted.length - 1));
    return sorted[index];
  }

  /**
   * Export metrics to JSON
   */
  toJSON(): string {
    return JSON.stringify(this.getAggregated(), null, 2);
  }

  /**
   * Export metrics to CSV
   */
  toCSV(): string {
    const headers = [
      'requestId',
      'success',
      'timeToFirstToken',
      'totalResponseTime',
      'tokenCount',
      'tokensPerSecond',
      'connectionDropped',
      'statusCode',
      'error',
    ];

    const rows = this.metrics.map(m => [
      m.requestId,
      m.success.toString(),
      m.timeToFirstToken.toString(),
      m.totalResponseTime.toString(),
      m.tokenCount.toString(),
      m.tokensPerSecond.toFixed(2),
      m.connectionDropped.toString(),
      m.statusCode?.toString() || '',
      m.error ? `"${m.error.replace(/"/g, '""')}"` : '',
    ]);

    return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  }

  /**
   * Reset the collector
   */
  reset(): void {
    this.metrics = [];
    this.startTime = Date.now();
    this.endTime = undefined;
  }

  /**
   * Get current metrics count
   */
  get count(): number {
    return this.metrics.length;
  }
}
