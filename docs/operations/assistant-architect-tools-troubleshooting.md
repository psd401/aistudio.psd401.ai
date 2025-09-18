# Assistant Architect Tools Troubleshooting Guide

## Overview

This guide provides comprehensive troubleshooting information for Assistant Architect tools, including common issues, diagnostic steps, and resolution procedures for administrators and users.

## Quick Diagnostic Checklist

Before diving into specific issues, run through this quick checklist:

- [ ] Model supports tools (GPT-5, GPT-4o, or Gemini Pro)
- [ ] Tools are enabled in the prompt configuration
- [ ] Assistant has required permissions
- [ ] System status shows all services operational
- [ ] Network connectivity is stable
- [ ] Recent successful executions in system

## Common Issues and Solutions

### 1. Tool Availability Issues

#### Issue: "No tools available for this model"
**Symptoms:**
- Tool options not visible in prompt editor
- Model dropdown doesn't show tool-compatible models
- Error message about model compatibility

**Diagnosis:**
```sql
-- SECURITY NOTE: The following SQL examples are for documentation purposes only.
-- In production code, ALWAYS use parameterized queries through the executeSQL function
-- with proper parameter binding to prevent SQL injection attacks.

-- Check available models with tool support
SELECT model_id, name, capabilities, active
FROM ai_models
WHERE active = true
AND capabilities::text LIKE '%tools%';
```

**Solutions:**
1. **Model Selection:**
   - Switch to GPT-5 for full tool support (web search + code interpreter)
   - Switch to GPT-4o for code interpreter only
   - Switch to Gemini Pro for web search + code interpreter

2. **Admin Configuration:**
   - Verify model is active in database
   - Check capabilities column includes tool permissions
   - Ensure API keys are configured for tool-supporting providers

3. **Permission Check:**
   ```sql
   -- SECURITY NOTE: The following SQL examples are for documentation purposes only.
   -- In production code, ALWAYS use parameterized queries through the executeSQL function
   -- with proper parameter binding to prevent SQL injection attacks.

   -- Verify user has access to tool-enabled models (use parameterized queries in actual implementation)
   SELECT u.username, r.role_name, ra.permission
   FROM users u
   JOIN user_roles ur ON u.id = ur.user_id
   JOIN roles r ON ur.role_id = r.id
   JOIN role_permissions ra ON r.id = ra.role_id
   WHERE u.cognito_sub = 'user_cognito_id'
   AND ra.permission LIKE '%tool%';
   ```

#### Issue: Tool options disappear after model change
**Cause:** Frontend not updating tool availability after model selection
**Solution:**
- Refresh the page
- Clear browser cache
- Check browser console for JavaScript errors
- Verify API endpoint `/api/models/{modelId}/tools` returns correct data

### 2. Execution Failures

#### Issue: Tool execution timeout
**Symptoms:**
- Execution stops after 30 seconds
- Status shows "timeout" or "failed"
- Incomplete results displayed

**Diagnosis:**
```bash
# Check SQS queue metrics
aws sqs get-queue-attributes \
  --queue-url "$TOOL_EXECUTION_QUEUE_URL" \
  --attribute-names All

# Check Lambda execution logs
aws logs filter-log-events \
  --log-group-name "/aws/lambda/assistant-architect-worker" \
  --start-time $(date -d '1 hour ago' +%s)000 \
  --filter-pattern "ERROR timeout"
```

**Solutions:**
1. **Immediate:**
   - Retry execution after 2-3 minutes
   - Simplify prompt to reduce complexity
   - Break complex tasks into smaller steps

2. **Performance Optimization:**
   - Increase Lambda timeout if needed (max 15 minutes)
   - Optimize web search queries for specificity
   - Review code interpreter prompts for efficiency

3. **Monitoring:**
   - Set up CloudWatch alarms for timeout rate >5%
   - Monitor average execution time trends
   - Track tool-specific performance metrics

#### Issue: Network failures during tool execution
**Symptoms:**
- Intermittent execution failures
- "Network error" or "Connection timeout" messages
- Partial results only

**Diagnosis:**
```bash
# Check network connectivity from Lambda
aws lambda invoke \
  --function-name assistant-architect-worker \
  --payload '{"test": "connectivity"}' \
  response.json

# Monitor API gateway errors
aws logs filter-log-events \
  --log-group-name "API-Gateway-Execution-Logs" \
  --filter-pattern "ERROR 5"
```

**Solutions:**
1. **Retry Logic:**
   - Implement exponential backoff for API calls
   - Add circuit breaker pattern for external services
   - Configure retry attempts (default: 3)

2. **Network Resilience:**
   - Use multiple DNS providers
   - Implement connection pooling
   - Add health checks for external tool APIs

3. **Fallback Strategies:**
   - Graceful degradation when tools unavailable
   - Clear user messaging about partial results
   - Option to retry with different tool configuration

### 3. Performance Issues

#### Issue: Slow tool execution (>30 seconds)
**Target:** <30 seconds total execution time
**Acceptable:** <45 seconds for complex multi-tool operations

**Diagnosis:**
```sql
-- SECURITY NOTE: The following SQL examples are for documentation purposes only.
-- In production code, ALWAYS use parameterized queries through the executeSQL function
-- with proper parameter binding to prevent SQL injection attacks.

-- Analyze execution performance
SELECT
  DATE(started_at) as execution_date,
  AVG(EXTRACT(EPOCH FROM (completed_at - started_at))) as avg_duration_seconds,
  COUNT(*) as execution_count,
  COUNT(CASE WHEN error_message IS NOT NULL THEN 1 END) as failure_count
FROM tool_executions
WHERE started_at > NOW() - INTERVAL '7 days'
GROUP BY DATE(started_at)
ORDER BY execution_date DESC;
```

**Performance Benchmarks:**
- **Web Search**: 5-15 seconds typical
- **Code Interpreter**: 3-10 seconds typical
- **Combined Tools**: 10-25 seconds typical

**Optimization Strategies:**
1. **Web Search Optimization:**
   - Use specific search terms to reduce result processing
   - Limit search result count (default: 10)
   - Cache frequently requested information

2. **Code Interpreter Optimization:**
   - Avoid complex visualizations during testing
   - Use efficient algorithms and data structures
   - Limit data processing to essential operations

3. **Infrastructure Scaling:**
   - Monitor Lambda concurrent executions
   - Scale up memory allocation for compute-heavy tasks
   - Consider reserved capacity for consistent performance

#### Issue: High failure rate (>5%)
**Target:** >95% success rate

**Monitoring Query:**
```sql
-- SECURITY NOTE: The following SQL examples are for documentation purposes only.
-- In production code, ALWAYS use parameterized queries through the executeSQL function
-- with proper parameter binding to prevent SQL injection attacks.

-- Calculate daily success rate
SELECT
  DATE(started_at) as date,
  COUNT(*) as total_executions,
  COUNT(CASE WHEN status = 'completed' THEN 1 END) as successful,
  ROUND(COUNT(CASE WHEN status = 'completed' THEN 1 END) * 100.0 / COUNT(*), 2) as success_rate
FROM tool_executions
WHERE started_at > NOW() - INTERVAL '30 days'
GROUP BY DATE(started_at)
ORDER BY date DESC;
```

**Common Failure Patterns:**
1. **API Rate Limiting:**
   - Implement token bucket algorithm
   - Distribute load across multiple API keys
   - Add intelligent backoff strategies

2. **Resource Exhaustion:**
   - Monitor Lambda memory usage
   - Optimize code for memory efficiency
   - Scale resources during peak hours

3. **Invalid Inputs:**
   - Add client-side validation
   - Sanitize inputs before tool execution
   - Provide clear error messages for invalid requests

### 4. Security and Validation Issues

#### Issue: Tool execution with invalid configurations
**Symptoms:**
- Security warnings in logs
- Unexpected tool behavior
- Data validation failures

**Security Checks:**
```sql
-- SECURITY NOTE: The following SQL examples are for documentation purposes only.
-- In production code, ALWAYS use parameterized queries through the executeSQL function
-- with proper parameter binding to prevent SQL injection attacks.

-- Audit tool configurations
SELECT
  aa.name,
  cp.enabled_tools,
  cp.model_id,
  u.username
FROM assistant_architects aa
JOIN chain_prompts cp ON aa.id = cp.tool_id
JOIN users u ON aa.user_id = u.id
WHERE cp.enabled_tools IS NOT NULL
AND cp.enabled_tools::text LIKE '%[%'
ORDER BY aa.created_at DESC;
```

**Validation Steps:**
1. **Input Sanitization:**
   - Check for XSS patterns in prompts
   - Validate tool parameter formats
   - Ensure proper encoding of special characters

2. **Permission Verification:**
   - Verify user has tool access permissions
   - Check model-tool compatibility matrix
   - Validate against security policies

3. **Output Filtering:**
   - Scan results for sensitive information
   - Apply content filtering rules
   - Log security events for audit

### 5. UI and User Experience Issues

#### Issue: Tool selection UI not responding
**Symptoms:**
- Checkboxes don't respond to clicks
- Tool options don't update after model change
- Form submission fails

**Debugging Steps:**
1. **Browser Console:**
   ```javascript
   // Check for JavaScript errors
   console.log("Tool selection errors:", window.toolSelectionErrors);

   // Verify tool data loading
   fetch('/api/models/1/tools')
     .then(response => response.json())
     .then(data => console.log("Tool data:", data));
   ```

2. **Network Tab:**
   - Verify API calls are completing successfully
   - Check response times for tool-related endpoints
   - Look for failed requests or 500 errors

3. **React DevTools:**
   - Check component state for tool selection
   - Verify props are updating correctly
   - Look for render loops or state inconsistencies

**Solutions:**
1. **Client-Side:**
   - Clear browser cache and cookies
   - Disable browser extensions temporarily
   - Try in incognito/private mode

2. **Server-Side:**
   - Restart application services
   - Check database connections
   - Verify API endpoint availability

#### Issue: Inconsistent tool availability across browsers
**Cause:** Browser-specific JavaScript compatibility issues
**Solution:**
- Test on supported browsers (Chrome, Firefox, Safari, Edge)
- Update to latest browser versions
- Check for polyfill requirements
- Verify responsive design breakpoints

## Monitoring and Alerting

### Key Metrics to Monitor

1. **Performance Metrics:**
   - Average execution time by tool type
   - 95th percentile execution time
   - Tool success rate (target: >95%)
   - Queue depth and processing time

2. **Error Metrics:**
   - Timeout rate (target: <2%)
   - API failure rate (target: <1%)
   - User error rate (invalid inputs)
   - System error rate (infrastructure)

3. **Usage Metrics:**
   - Tools usage by model type
   - Peak execution times
   - User adoption rate
   - Feature utilization patterns

### CloudWatch Alarms

```bash
# High failure rate alarm
aws cloudwatch put-metric-alarm \
  --alarm-name "ToolExecutionFailureRate" \
  --alarm-description "Tool execution failure rate > 5%" \
  --metric-name "FailureRate" \
  --namespace "AI-Studio/Tools" \
  --statistic "Average" \
  --period 300 \
  --threshold 5.0 \
  --comparison-operator "GreaterThanThreshold"

# Long execution time alarm
aws cloudwatch put-metric-alarm \
  --alarm-name "ToolExecutionLatency" \
  --alarm-description "Tool execution time > 30 seconds" \
  --metric-name "ExecutionDuration" \
  --namespace "AI-Studio/Tools" \
  --statistic "Average" \
  --period 300 \
  --threshold 30000 \
  --comparison-operator "GreaterThanThreshold"
```

### Dashboard Configuration

Create monitoring dashboards with:
- Real-time execution status
- Performance trend charts
- Error rate by tool type
- User adoption metrics
- System health indicators

## Advanced Troubleshooting

### Database Queries for Diagnosis

```sql
-- SECURITY NOTE: The following SQL examples are for documentation purposes only.
-- In production code, ALWAYS use parameterized queries through the executeSQL function
-- with proper parameter binding to prevent SQL injection attacks.

-- Recent execution analysis
SELECT
  te.id,
  te.status,
  te.started_at,
  te.completed_at,
  te.error_message,
  aa.name as assistant_name,
  cp.enabled_tools
FROM tool_executions te
JOIN assistant_architects aa ON te.tool_id = aa.id
JOIN chain_prompts cp ON aa.id = cp.tool_id
WHERE te.started_at > NOW() - INTERVAL '1 hour'
ORDER BY te.started_at DESC;

-- Tool usage patterns
SELECT
  enabled_tools,
  COUNT(*) as usage_count,
  AVG(EXTRACT(EPOCH FROM (completed_at - started_at))) as avg_duration
FROM tool_executions te
JOIN assistant_architects aa ON te.tool_id = aa.id
JOIN chain_prompts cp ON aa.id = cp.tool_id
WHERE te.started_at > NOW() - INTERVAL '24 hours'
AND te.status = 'completed'
GROUP BY enabled_tools
ORDER BY usage_count DESC;
```

### Log Analysis

```bash
# Search for specific error patterns
aws logs filter-log-events \
  --log-group-name "/aws/lambda/assistant-architect-worker" \
  --filter-pattern "{ $.level = \"ERROR\" && $.toolType exists }" \
  --start-time $(date -d '2 hours ago' +%s)000

# Performance analysis
aws logs filter-log-events \
  --log-group-name "/aws/lambda/assistant-architect-worker" \
  --filter-pattern "{ $.executionTime > 30000 }" \
  --start-time $(date -d '24 hours ago' +%s)000
```

### API Testing

```bash
# Test tool availability endpoint
curl -X GET "https://api.aistudio.example.com/api/models/1/tools" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json"

# Test tool execution endpoint
curl -X POST "https://api.aistudio.example.com/api/assistant-architect/execute" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "assistantId": 123,
    "inputs": {"query": "test execution"},
    "enabledTools": ["web_search"]
  }'
```

## Escalation Procedures

### Level 1 - User Issues
- Verify basic troubleshooting steps completed
- Check system status and known issues
- Guide through tool configuration
- Document issue for tracking

### Level 2 - Technical Issues
- Review system logs and metrics
- Analyze database performance
- Check infrastructure health
- Implement temporary workarounds

### Level 3 - Critical Issues
- Engage development team
- Review architecture and scaling
- Implement emergency procedures
- Coordinate with external service providers

## Recovery Procedures

### Service Degradation
1. **Partial Tool Availability:**
   - Disable problematic tools temporarily
   - Redirect users to working alternatives
   - Communicate status to users

2. **Performance Degradation:**
   - Scale up infrastructure resources
   - Enable additional caching
   - Implement load balancing

### Full Service Outage
1. **Immediate Response:**
   - Activate incident response team
   - Communicate with stakeholders
   - Implement emergency procedures

2. **Recovery Steps:**
   - Restore from known good configuration
   - Validate data integrity
   - Gradually restore service capacity
   - Monitor for stability

## Contact Information

- **Level 1 Support**: support@aistudio.example.com
- **Technical Support**: tech-support@aistudio.example.com
- **Emergency Hotline**: +1-800-EMERGENCY
- **Status Page**: https://status.aistudio.example.com

---

*Last updated: September 2025*
*Document version: 1.0*