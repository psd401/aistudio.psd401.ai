# Context Loading Safeguards Documentation

## Overview
This document outlines the critical safeguards implemented to prevent context loading and page reload issues in the Assistant Architect follow-up chat feature.

## Known Issues That These Safeguards Prevent

### 1. "streaming" ExecutionId Bug
- **Issue**: ExecutionId was being sent as the string "streaming" instead of a valid numeric ID
- **Impact**: Context would fail to load, resulting in AI responses without access to assistant knowledge
- **Prevention**: Multiple validation layers reject invalid executionId values

### 2. Missing System Context
- **Issue**: system_context from chain_prompts table was not being loaded
- **Impact**: AI could not access the assistant's knowledge base (e.g., "10 elements of dignity")
- **Prevention**: Explicit queries for system_context with snake_case/camelCase handling

### 3. Page Reload on Send
- **Issue**: Clicking send in follow-up chat would reload the entire page
- **Impact**: Lost conversation context and poor user experience
- **Prevention**: Proper event.preventDefault() and fetch overrides

### 4. SQL Column Name Errors
- **Issue**: Using non-existent column names (e.g., aa.instructions, te.input_values)
- **Impact**: SQL errors preventing context from loading
- **Prevention**: Documented correct column names and validation

## Implementation Details

### 1. ExecutionId Validation (`/app/api/chat/stream-final/route.ts`)

```typescript
// Layer 1: Function parameter validation
if (!execId || isNaN(execId) || execId <= 0) {
  logger.error('[stream-final] Invalid execution ID provided');
  return null;
}

// Layer 2: String value rejection
if (executionId === 'streaming' || executionId === 'undefined') {
  logger.error('[stream-final] Invalid executionId received:', executionId);
  execIdToUse = null;
}

// Layer 3: Numeric validation
const numId = parseInt(String(execId), 10);
if (!isNaN(numId) && numId > 0) {
  validExecutionId = numId;
}
```

### 2. System Context Loading

```typescript
// Handles both snake_case and camelCase
const context = row.system_context || row.systemContext || '';

// Validates presence
if (systemContexts.length === 0 && allChainPrompts.length > 0) {
  logger.error('[stream-final] WARNING: No system contexts found');
}
```

### 3. Monitoring Integration (`/lib/monitoring/context-loading-monitor.ts`)

```typescript
// Automatic tracking of all context loads
contextMonitor.trackContextLoad(startTime, {
  executionId: execId,
  systemContexts,
  chainPrompts: allChainPrompts,
  contextLength: executionContext.length
});

// Alerts on critical issues
if (executionId === 'streaming') {
  this.sendAlert('CRITICAL', 'Invalid executionId "streaming" detected');
}
```

### 4. Component-Level Safeguards

#### AssistantArchitectExecution (`/components/features/assistant-architect/assistant-architect-execution.tsx`)
- Validates execution ID before passing to chat
- Ensures complete event contains valid numeric ID
- Prevents "streaming" from being used as ID

#### AssistantArchitectChat (`/components/features/assistant-architect/assistant-architect-chat.tsx`)
- Double-validates executionId in context creation
- Final validation in fetch override
- Prevents invalid IDs from reaching API

## Critical SQL Queries

### Correct Column Names
```sql
-- chain_prompts table
cp.system_context     -- NOT cp.system_prompt
cp.content           -- NOT cp.prompt
cp.position          -- NOT cp.order_index

-- tool_executions table  
te.input_data        -- NOT te.input_values
te.assistant_architect_id

-- assistant_architects table
aa.name
aa.description       -- NOT aa.instructions (doesn't exist)
```

## Testing Safeguards

### Unit Tests (`/tests/context-loading-safeguards.test.ts`)
Run tests to verify safeguards:
```bash
npm test context-loading-safeguards
```

### Manual Testing Checklist
1. Execute an assistant architect tool
2. Click "Follow-up" after execution completes
3. Verify:
   - [ ] No page reload occurs
   - [ ] AI has access to assistant knowledge
   - [ ] System contexts are loaded
   - [ ] ExecutionId is numeric (check browser console)

### Monitoring Dashboard
Check metrics:
```typescript
const summary = contextMonitor.getMetricsSummary();
console.log(summary);
// Should show:
// - invalidExecutionIds: 0
// - missingSystemContexts: 0
// - avgLoadTimeMs: < 2000
```

## Maintenance Guidelines

### When Adding New Features
1. **Never** pass "streaming" as an executionId
2. **Always** validate numeric IDs before use
3. **Test** with assistant knowledge questions
4. **Monitor** the first 24 hours after deployment

### When Modifying SQL Queries
1. Verify column names against schema (`/infra/database/schema/002-tables.sql`)
2. Test queries in AWS RDS Query Editor first
3. Handle both snake_case and camelCase in results

### When Updating Components
1. Maintain all existing validation layers
2. Add new validations at component boundaries
3. Log all ID transformations for debugging
4. Test the complete flow end-to-end

## Emergency Response

If context loading issues reoccur:

1. **Check Monitoring Alerts**
   ```typescript
   contextMonitor.getRecentMetrics(20);
   ```

2. **Verify ExecutionId Flow**
   - Browser console → Network tab → stream-final request
   - Check executionId in request body

3. **Check SQL Errors**
   - CloudWatch logs for "column does not exist"
   - Verify against schema file

4. **Rollback if Needed**
   - These safeguards are isolated and can be disabled
   - Core functionality will continue without monitoring

## Common Pitfalls to Avoid

1. **Don't** remove the executionId validation thinking it's redundant
2. **Don't** assume RDS returns consistent field casing
3. **Don't** trust executionId from events without validation
4. **Don't** skip the preventDefault() in form submissions
5. **Don't** remove the fetch override in useChat

## Success Metrics

The safeguards are working correctly when:
- Zero "streaming" executionIds in logs
- 100% of follow-up chats can answer knowledge questions
- Zero page reloads during chat interactions
- Context load time < 2 seconds average
- No SQL column errors in logs