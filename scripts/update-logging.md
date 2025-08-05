# Files Requiring Logging Updates

## Server Actions (13 files)
1. ✅ actions/db/get-current-user-action.ts - DONE
2. ❌ actions/admin/repositories.actions.ts - uses handleError but needs full pattern
3. ❌ actions/create-github-issue-action.ts
4. ❌ actions/db/ai-models-actions.ts
5. ❌ actions/db/assistant-architect-actions.ts
6. ❌ actions/db/jobs-actions.ts
7. ❌ actions/db/model-comparison-actions.ts
8. ❌ actions/db/navigation-actions.ts
9. ❌ actions/db/settings-actions.ts
10. ❌ actions/repositories/repository-items.actions.ts
11. ❌ actions/repositories/repository.actions.ts
12. ❌ actions/repositories/search.actions.ts
13. ❌ actions/repositories/repository-permissions.ts

## API Routes (50+ files)
- All files in app/api/**/route.ts need logging updates

## Update Pattern for Server Actions

```typescript
// Add imports
import { 
  createLogger, 
  generateRequestId, 
  startTimer, 
  sanitizeForLogging 
} from "@/lib/logger"
import { 
  handleError, 
  ErrorFactories, 
  createSuccess 
} from "@/lib/error-utils"

// Update function
export async function myAction(params: ParamsType): Promise<ActionState<ReturnType>> {
  const requestId = generateRequestId()
  const timer = startTimer("myAction")
  const log = createLogger({ requestId, action: "myAction" })
  
  try {
    log.info("Action started", { params: sanitizeForLogging(params) })
    
    // Existing logic...
    
    timer({ status: "success" })
    log.info("Action completed successfully")
    
    return createSuccess(result, "Success message")
  } catch (error) {
    timer({ status: "error" })
    return handleError(error, "User-friendly error message", {
      context: "myAction",
      requestId,
      operation: "myAction"
    })
  }
}
```