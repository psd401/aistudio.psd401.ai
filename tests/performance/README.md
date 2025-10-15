# Performance Testing Suite

Comprehensive performance and load testing for AI Studio's streaming architecture.

## Overview

This suite validates that the streaming infrastructure meets performance targets defined in issue #311:
- ✅ Time-to-first-token (TTFT) <1s at p95
- ✅ Support for 100+ concurrent streaming sessions
- ✅ No memory leaks during extended operation
- ✅ Very long responses (15+ minutes) complete successfully
- ✅ Graceful degradation under extreme load

## Quick Start

### Run All Performance Tests

```bash
npm run test:perf
```

### Run Individual Test Suites

```bash
# TTFT validation (fastest, ~5 minutes)
npm run test:perf:ttft

# Concurrent streaming (100+ users, ~10 minutes)
npm run test:perf:concurrent

# Long-running streams (15-30 min streams, ~30 minutes)
npm run test:perf:long

# Memory leak detection (1 hour sustained load, ~90 minutes)
npm run test:perf:memory

# Stress testing (gradual load increase, ~30 minutes)
npm run test:perf:stress
```

## Test Environment Setup

### ⚠️ Important: Setup Validation

**Performance tests will fail immediately with a clear error message if:**
- Testing against a real API without authentication configured
- Required environment variables are missing

This prevents silent failures and wasted test runs.

### Local Testing

By default, tests run against `http://localhost:3000`:

```bash
# Start the development server
npm run dev

# Run tests in another terminal
npm run test:perf:ttft
```

**Note**: Local testing without authentication is supported for development.

### Staging/Production Testing

Set environment variables to test against remote environments:

```bash
# Test against staging
TEST_ENV=staging npm run test:perf:concurrent

# Test against production (use carefully!)
TEST_ENV=production npm run test:perf:ttft
```

### Authentication

**Required for staging/production testing.** Tests will fail with a clear error if not configured.

Option 1: Use an authentication token
```bash
export AUTH_TOKEN="your-jwt-token-here"
npm run test:perf
```

Option 2: Configure test user credentials
```bash
export TEST_USER_EMAIL="test@example.com"
export TEST_USER_PASSWORD="password"
npm run test:perf
```

### Setup Validation

Before running tests, the framework validates:
- ✅ Authentication is configured for non-local environments
- ✅ Required environment variables are set
- ✅ Test environment is properly specified

**If validation fails**, you'll see a clear error message like:
```
❌ Performance Test Setup Invalid

   Performance tests require valid authentication when testing against real APIs.

   Please configure one of the following:
     1. Environment variable: export AUTH_TOKEN="your-jwt-token"
     2. Test user credentials:
        export TEST_USER_EMAIL="test@example.com"
        export TEST_USER_PASSWORD="your-password"
```

This prevents tests from running with improper setup and wasting time.

## Test Suites

### 1. Streaming Performance (`streaming-performance.test.ts`)

**Purpose:** Validate TTFT across different models and prompt lengths.

**What it tests:**
- Short prompts (baseline performance)
- Medium prompts (realistic usage)
- Cross-provider comparison (OpenAI, Anthropic, Google, Bedrock)
- Response time consistency

**Duration:** ~5-10 minutes

**Acceptance Criteria:**
- TTFT p95 < 1000ms
- Error rate < 0.5%

### 2. Concurrent Streams (`concurrent-streams.test.ts`)

**Purpose:** Validate system handles 100+ concurrent streaming sessions.

**What it tests:**
- 100 concurrent streams
- 200 concurrent streams (stress)
- Sustained concurrent load (1 minute)

**Duration:** ~10-15 minutes

**Acceptance Criteria:**
- Support 100+ concurrent streams
- Error rate < 0.5%
- No connection drops

### 3. Long-Running Streams (`long-running-streams.test.ts`)

**Purpose:** Ensure very long streaming responses complete successfully.

**What it tests:**
- 15-minute streaming sessions
- Multiple sequential long streams
- Memory behavior during long streams
- 30-minute extreme duration (optional)

**Duration:** ~30-45 minutes

**Acceptance Criteria:**
- Streams run for 15+ minutes without timeout
- No connection drops
- Memory remains stable

### 4. Memory Leak Detection (`memory-leak-detection.test.ts`)

**Purpose:** Detect memory leaks during sustained operation.

**What it tests:**
- 1-hour sustained load with heap monitoring
- Burst load followed by garbage collection
- Memory growth over time
- Heap snapshots at intervals

**Duration:** ~90 minutes

**Acceptance Criteria:**
- Memory growth < 100MB/hour
- Cleanup efficiency > 50%
- No unbounded heap growth

**Note:** Run with `--expose-gc` flag for better results:
```bash
node --expose-gc node_modules/.bin/jest --testMatch='**/memory-leak-detection.test.ts'
```

### 5. Stress Testing (`stress-test.test.ts`)

**Purpose:** Find system breaking points and validate graceful degradation.

**What it tests:**
- Gradual load increase (1 → 200 users)
- Rapid spike load (0 → 100 users instantly)
- System behavior under extreme load

**Duration:** ~30-60 minutes

**Acceptance Criteria:**
- Handle 100+ users gracefully
- Degrade gracefully (no crashes)
- Error rate remains manageable

## Understanding Results

### Report Formats

All tests generate three report formats in `tests/performance/reports/`:

1. **Markdown (`.md`)** - Human-readable summary with pass/fail indicators
2. **JSON (`.json`)** - Complete metrics data for analysis
3. **CSV (`.csv`)** - Individual request data for spreadsheet analysis

### Key Metrics

- **TTFT (Time-to-First-Token):** Latency until first token arrives (ms)
- **Response Time:** Total time from request to completion (ms)
- **Throughput:** Tokens per second during streaming
- **Error Rate:** Percentage of failed requests
- **Connection Drops:** Requests that lost connection mid-stream

### Interpreting Results

✅ **PASS Indicators:**
- TTFT p95 < 1000ms
- Error rate < 0.5%
- 100+ successful concurrent streams
- Memory growth < 100MB/hour

❌ **FAIL Indicators:**
- TTFT p95 > 1000ms
- Error rate > 0.5%
- Frequent connection drops
- Unbounded memory growth

## Configuration

### Performance Targets

Edit `tests/performance/config.ts` to adjust targets:

```typescript
export const PERFORMANCE_TARGETS = {
  ttftP95: 1000,           // <1s for 95th percentile
  maxErrorRate: 0.5,       // <0.5% error rate
  minConcurrentStreams: 100, // Support 100+ concurrent
  maxMemoryGrowthMB: 100,   // <100MB growth/hour
};
```

### Test Models

Configure which models to test:

```typescript
export const TEST_MODELS = [
  { modelId: 'gpt-4o', provider: 'openai' },
  { modelId: 'claude-3-5-sonnet-20241022', provider: 'anthropic' },
  // Add more models...
];
```

### Environment Variables

Override config via environment variables:

```bash
# Override performance targets
PERF_TTFT_P95=800 npm run test:perf:ttft

# Set test environment
TEST_ENV=staging npm run test:perf

# Set authentication
AUTH_TOKEN="token" npm run test:perf
```

## Troubleshooting

### Tests Timing Out

- Increase Jest timeout: `jest.setTimeout(15 * 60 * 1000)`
- Check network connectivity
- Verify server is running and responsive

### High Error Rates

- Check server logs for errors
- Verify API endpoint URLs
- Test with lower concurrency first
- Check authentication tokens

### Memory Tests Failing

- Run with `--expose-gc` flag
- Increase snapshot intervals
- Check for actual memory leaks in application code

### Authentication Failures

- Verify token is valid and not expired
- Check test user credentials
- Test manual API calls with same credentials

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Performance Tests

on:
  schedule:
    - cron: '0 2 * * 0' # Weekly on Sunday at 2am
  workflow_dispatch:

jobs:
  performance:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npm run test:perf:ttft
        env:
          TEST_ENV: staging
          AUTH_TOKEN: ${{ secrets.STAGING_AUTH_TOKEN }}
      - uses: actions/upload-artifact@v3
        with:
          name: performance-reports
          path: tests/performance/reports/
```

## Best Practices

1. **Run locally first** - Validate tests work before CI/CD
2. **Start with quick tests** - Run TTFT tests before long-running ones
3. **Monitor resources** - Watch CPU/memory during tests
4. **Baseline early** - Run tests on known-good builds for comparison
5. **Regular cadence** - Schedule weekly or bi-weekly performance tests
6. **Analyze trends** - Compare results over time, not just pass/fail

## Further Reading

- [Performance Testing Strategy](/docs/operations/PERFORMANCE_TESTING.md) - Overall strategy and methodology
- [Issue #311](https://github.com/psd401/aistudio.psd401.ai/issues/311) - Original requirements
- [Architecture Docs](/docs/ARCHITECTURE.md) - System architecture overview
