# Lambda Document Processor Issues & Resolution

## Issue Discovered: August 30, 2025

### Problem
The Lambda document processor (`lambdas/document-processor-v2`) was failing with `Runtime.ImportModuleError: Cannot find module 'index'` because:

1. **No TypeScript compilation** - Missing `tsconfig.json` caused `tsc` build to fail
2. **Incorrect imports** - Lambda code trying to import from Next.js app paths (`@/lib/*`) which don't exist in Lambda context
3. **Missing dependencies** - Lambda trying to use main app's database and AI helpers

### Root Cause
Instead of copying working document processing code from the main app (`lib/document-processing.ts`), new Lambda-specific processors were created that had dependencies on the main application context.

### Immediate Fix Required
1. **Copy working document processing logic** from `lib/document-processing.ts` to Lambda
2. **Remove Next.js app dependencies** from Lambda processors
3. **Create standalone Lambda versions** of required utilities
4. **Add proper TypeScript configuration** for Lambda compilation
5. **Full lint and typecheck** before deployment

### Files Affected
- `lambdas/document-processor-v2/index.ts` - Main handler (working)
- `lambdas/document-processor-v2/processors/pdf-processor.ts` - Broken imports to `@/lib/*`
- `lambdas/document-processor-v2/processors/office-processor.ts` - TypeScript errors
- `lambdas/document-processor-v2/processors/text-processor.ts` - TypeScript errors
- `lambdas/document-processor-v2/tsconfig.json` - Missing (added)

### Action Items
- [ ] Copy working document processing from main app
- [ ] Remove all `@/lib/*` imports from Lambda
- [ ] Fix TypeScript strict mode errors
- [ ] Run `npm run lint` and `npm run typecheck` 
- [ ] Test Lambda locally before deploying
- [ ] Redeploy DocumentProcessingStack with working Lambda

### Testing Status
Document uploads are currently failing because Lambda processor crashes on startup. The Nexus chat system works, but v2 document processing (XLSX, DOCX, etc.) routes to the broken Lambda.