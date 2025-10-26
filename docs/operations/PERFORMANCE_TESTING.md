# Performance Testing Strategy

Comprehensive guide to performance testing for AI Studio's streaming architecture.

## Executive Summary

AI Studio implements a performance testing strategy to ensure the streaming architecture meets production requirements:
- **TTFT (Time-to-First-Token):** < 1 second at p95
- **Concurrency:** 100+ concurrent streaming sessions
- **Reliability:** < 0.5% error rate
- **Memory:** No leaks during extended operation
- **Availability:** 15+ minute streams complete successfully

## Testing Methodology

### Test Types

#### 1. TTFT (Time-to-First-Token) Testing
**Purpose:** Measure response latency from request to first token.

**Approach:**
- Run 50+ requests per model/provider
- Test multiple prompt lengths (short, medium, long)
- Calculate percentiles (p50, p95, p99)
- Compare across providers

**Success Criteria:**
- p95 < 1000ms
- p99 < 2000ms
- Coefficient of variation < 50%

#### 2. Concurrent Load Testing
**Purpose:** Validate system handles multiple simultaneous streams.

**Approach:**
- Launch 100-200 concurrent streaming requests
- Monitor error rates and connection stability
- Track TTFT degradation under load
- Test sustained concurrent load over time

**Success Criteria:**
- 100+ concurrent streams successful
- Error rate < 0.5%
- Zero connection drops

#### 3. Endurance Testing
**Purpose:** Ensure long-running streams complete without issues.

**Approach:**
- Test 15-30 minute streaming sessions
- Monitor memory usage throughout
- Verify no timeouts or disconnections
- Run multiple sequential long streams

**Success Criteria:**
- Streams complete successfully
- No connection drops
- Stable memory footprint

#### 4. Memory Leak Detection
**Purpose:** Identify memory leaks during sustained operation.

**Approach:**
- Run 1-hour sustained load
- Capture heap snapshots every 5 minutes
- Monitor heap growth and RSS
- Test memory cleanup after burst load

**Success Criteria:**
- Heap growth < 100MB/hour
- Cleanup efficiency > 50%
- No unbounded growth

#### 5. Stress Testing
**Purpose:** Find breaking points and validate graceful degradation.

**Approach:**
- Gradually increase load from 1 → 200 users
- Measure degradation at each step
- Test rapid spike loads (0 → 100 instantly)
- Identify optimal capacity

**Success Criteria:**
- System handles 100+ users gracefully
- No crashes under extreme load
- Graceful degradation (manageable error rates)

## When to Run Performance Tests

### Development Cycle

**Before Each Release:**
- Run full performance test suite
- Compare against baseline metrics
- Block release if critical metrics regress

**After Significant Changes:**
Run relevant subset based on change type:
- Streaming architecture changes → Full suite
- Database changes → TTFT + Concurrent tests
- Model provider changes → TTFT cross-provider test
- Infrastructure changes → Memory + Stress tests

**Weekly Schedule:**
- Monday: TTFT tests (quick validation)
- Wednesday: Concurrent tests
- Friday: Full suite (if time permits)

### CI/CD Integration

**Pull Request Checks:**
- TTFT tests only (fast feedback, ~5 minutes)
- Block PR if TTFT p95 > 1000ms

**Nightly Builds:**
- Full test suite on staging
- Report results in Slack/email
- Archive reports for trend analysis

**Production Monitoring:**
- Synthetic tests every hour
- Alert if TTFT p95 exceeds threshold
- Track metrics in CloudWatch

## Performance Baselines

### Current Baselines (as of implementation)

| Metric | Target | Typical | Notes |
|--------|--------|---------|-------|
| TTFT p50 (short prompts) | <500ms | ~300ms | OpenAI GPT-4o-mini |
| TTFT p95 (short prompts) | <1000ms | ~600ms | OpenAI GPT-4o-mini |
| TTFT p99 (short prompts) | <2000ms | ~900ms | OpenAI GPT-4o-mini |
| Concurrent streams | 100+ | 100 | No degradation |
| Error rate | <0.5% | ~0.1% | Normal operation |
| Memory growth | <100MB/hr | ~30MB/hr | 10 concurrent streams |
| Throughput | >10 tok/s | ~50 tok/s | Model dependent |

### Provider-Specific Baselines

**OpenAI (GPT-4o-mini):**
- TTFT p95: ~600ms
- Throughput: ~50 tokens/sec
- Reliability: 99.9%

**Anthropic (Claude 3.5 Sonnet):**
- TTFT p95: ~800ms
- Throughput: ~40 tokens/sec
- Reliability: 99.8%

**Google (Gemini 2.0 Flash):**
- TTFT p95: ~700ms
- Throughput: ~45 tokens/sec
- Reliability: 99.7%

## Analyzing Results

### Trends to Monitor

**Positive Trends:**
- ✅ Decreasing TTFT over time
- ✅ Stable error rates
- ✅ Flat or decreasing memory usage
- ✅ Increasing concurrent capacity

**Warning Signs:**
- ⚠️ Gradual TTFT increase (infrastructure degradation)
- ⚠️ Increasing error rates (reliability issues)
- ⚠️ Memory growth over time (potential leak)
- ⚠️ Decreasing throughput (performance regression)

### Root Cause Analysis

**High TTFT:**
- Check provider API latency
- Verify network connectivity
- Review server resource usage (CPU, memory)
- Check database query performance
- Validate connection pooling

**High Error Rates:**
- Review server logs for exceptions
- Check provider API status
- Verify authentication/authorization
- Monitor rate limits
- Check timeout configurations

**Memory Leaks:**
- Analyze heap snapshots
- Review connection cleanup
- Check for circular references
- Verify event listener cleanup
- Profile with Chrome DevTools

**Connection Drops:**
- Check load balancer timeout settings
- Verify Lambda/ECS timeout configs
- Review network stability
- Check client-side timeout handling
- Monitor CloudFront behavior

## Optimization Strategies

### TTFT Optimization

1. **Provider Selection:** Route to fastest provider for use case
2. **Caching:** Cache frequent requests (with TTL)
3. **Connection Pooling:** Reuse HTTP connections
4. **Edge Deployment:** Deploy closer to users/providers
5. **Request Batching:** Batch where possible

### Concurrency Optimization

1. **Auto-scaling:** Scale based on connection count
2. **Load Balancing:** Distribute across multiple instances
3. **Connection Limits:** Set appropriate limits per instance
4. **Resource Allocation:** Adequate CPU/memory per container
5. **Circuit Breakers:** Prevent cascade failures

### Memory Optimization

1. **Stream Cleanup:** Ensure proper cleanup after streams
2. **Connection Cleanup:** Close connections promptly
3. **Buffer Management:** Limit buffer sizes
4. **Garbage Collection:** Tune GC settings
5. **Memory Limits:** Set container memory limits

## Tools and Infrastructure

### Testing Tools

**Custom Framework:**
- `StreamClient` - SSE client with metrics
- `MetricsCollector` - Statistical analysis
- `ReportGenerator` - Multi-format reporting

**Infrastructure:**
- Jest - Test runner
- Node.js Fetch API - HTTP requests
- Process memory API - Heap monitoring

### Monitoring and Observability

**CloudWatch Metrics:**
- API latency (p50, p95, p99)
- Error rates by endpoint
- Concurrent connections
- Memory usage per container
- CPU utilization

**CloudWatch Logs:**
- Request/response logging
- Error tracking
- Performance timing logs

**X-Ray Tracing:**
- End-to-end request tracing
- Service dependency mapping
- Latency breakdown by service

## Escalation and Response

### Performance Degradation Response

**P0 - Critical (TTFT p95 > 2s, Error rate > 5%):**
1. Page on-call engineer immediately
2. Check provider status pages
3. Review recent deployments
4. Scale up immediately if needed
5. Roll back if recent change caused it

**P1 - High (TTFT p95 > 1.5s, Error rate > 2%):**
1. Notify engineering team
2. Investigate within 1 hour
3. Plan mitigation within 4 hours
4. Root cause analysis within 24 hours

**P2 - Medium (TTFT p95 > 1s, Error rate > 0.5%):**
1. Create ticket for investigation
2. Investigate within 24 hours
3. Plan optimization if needed
4. Monitor for further degradation

## Historical Performance Data

### Storing Results

**Location:** `tests/performance/reports/`

**Format:**
- `{test-name}_{timestamp}.md` - Human readable
- `{test-name}_{timestamp}.json` - Machine readable
- `{test-name}_{timestamp}.csv` - Spreadsheet analysis

**Retention:**
- Keep last 30 days locally
- Archive to S3 for long-term storage
- Create monthly performance summaries

### Trend Analysis

**Monthly Review:**
- Compare current vs previous month
- Identify degradation trends
- Celebrate improvements
- Plan optimization efforts

**Quarterly Planning:**
- Review capacity trends
- Plan infrastructure scaling
- Budget for optimizations
- Set performance goals

## Team Responsibilities

### Development Team
- Run tests before major changes
- Fix performance regressions
- Implement optimizations
- Review performance in code reviews

### DevOps Team
- Maintain test infrastructure
- Monitor production performance
- Configure auto-scaling
- Manage CI/CD pipelines

### QA Team
- Run weekly test suite
- Analyze results
- Report regressions
- Validate fixes

### Product Team
- Define performance requirements
- Prioritize optimizations
- Review user impact
- Approve releases

## Future Enhancements

### Planned Improvements

1. **Real User Monitoring (RUM)**
   - Capture client-side metrics
   - Track geographic performance
   - Monitor across browsers/devices

2. **Automated Regression Detection**
   - Automatic baseline comparison
   - PR blocking on regression
   - Trend anomaly detection

3. **Performance Budgets**
   - Set budgets per feature
   - Track against budgets
   - Enforce in CI/CD

4. **Advanced Profiling**
   - CPU flame graphs
   - Memory heap dumps
   - Network waterfall analysis

5. **Load Testing Infrastructure**
   - Dedicated load testing environment
   - Geographic distribution
   - More realistic traffic patterns

## References

- [Performance Test Suite README](/tests/performance/README.md) - Test execution guide
- [Issue #311](https://github.com/psd401/aistudio.psd401.ai/issues/311) - Original requirements
- [AWS Performance Best Practices](https://docs.aws.amazon.com/wellarchitected/latest/performance-efficiency-pillar/welcome.html)
- [Streaming Architecture Docs](/docs/ARCHITECTURE.md) - System architecture

---

**Last Updated:** October 2025
**Owner:** Engineering Team
**Review Cycle:** Quarterly
