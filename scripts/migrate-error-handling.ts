#!/usr/bin/env ts-node
/**
 * Error Handling Migration Script
 * 
 * This script helps migrate existing code to the new error handling system:
 * 1. Server actions in the actions/ directory
 * 2. API routes in app/api/ directory
 * 
 * Example usage:
 *   # Run script without making changes (dry run)
 *   npx ts-node scripts/migrate-error-handling.ts --dry-run
 * 
 *   # Migrate a specific file
 *   npx ts-node scripts/migrate-error-handling.ts --file=app/api/users/route.ts
 * 
 *   # Migrate all server actions
 *   npx ts-node scripts/migrate-error-handling.ts --actions
 * 
 *   # Migrate all API routes
 *   npx ts-node scripts/migrate-error-handling.ts --api
 * 
 *   # Migrate everything
 *   npx ts-node scripts/migrate-error-handling.ts --all
 */

import * as fs from 'fs';
import * as path from 'path';
import * as glob from 'glob';
import logger from "@/lib/logger"

// Configuration
const ROOT_DIR = path.resolve(__dirname, '..');
const DRY_RUN = process.argv.includes('--dry-run');
const SPECIFIC_FILE = process.argv.find(arg => arg.startsWith('--file='))?.split('=')[1];
const MIGRATE_ACTIONS = process.argv.includes('--actions') || process.argv.includes('--all');
const MIGRATE_API = process.argv.includes('--api') || process.argv.includes('--all');

// Check if any mode is specified
if (!SPECIFIC_FILE && !MIGRATE_ACTIONS && !MIGRATE_API) {
  logger.info('No migration target specified. Use --actions, --api, --all, or --file=path');
  process.exit(1);
}

logger.info(`
========================================
   Error Handling Migration Tool
========================================
Mode: ${DRY_RUN ? 'Dry run (no changes will be made)' : 'Live run (files will be updated)'}
`);

// Helper functions
function findFiles(pattern: string): string[] {
  return glob.sync(pattern, { cwd: ROOT_DIR, absolute: true });
}

// Get files to process
const filesToProcess: string[] = [];

if (SPECIFIC_FILE) {
  const filePath = path.resolve(ROOT_DIR, SPECIFIC_FILE);
  if (fs.existsSync(filePath)) {
    filesToProcess.push(filePath);
  } else {
    logger.error(`File not found: ${SPECIFIC_FILE}`);
    process.exit(1);
  }
}

if (MIGRATE_ACTIONS) {
  const actionFiles = findFiles('actions/**/*.ts');
  filesToProcess.push(...actionFiles);
  logger.info(`Found ${actionFiles.length} server action files`);
}

if (MIGRATE_API) {
  const apiFiles = findFiles('app/api/**/*.ts');
  filesToProcess.push(...apiFiles);
  logger.info(`Found ${apiFiles.length} API route files`);
}

// Process files
let processedCount = 0;
let skippedCount = 0;
let errorCount = 0;

function processServerAction(content: string): string {
  // Add imports
  if (!content.includes('import { createSuccess, handleError') && 
      !content.includes('import { handleError, createSuccess')) {
    content = content.replace(
      /import {(.+?)} from ["']@\/types["']/,
      'import { $1 } from "@/types"\nimport { createSuccess, handleError } from "@/lib/error-utils"'
    );
  }

  // Replace try/catch blocks
  content = content.replace(
    /try\s*{([\s\S]+?)return\s*{\s*isSuccess:\s*true,\s*message:([\s\S]+?),\s*data:([\s\S]+?)\s*}\s*}\s*catch\s*\(error\)\s*{[\s\S]+?console\.error\([\s\S]+?\)\s*return\s*{\s*isSuccess:\s*false,\s*message:([\s\S]+?)\s*}\s*}/g,
    (match, tryBlock, successMessage, data, errorMessage) => {
      return `try {${tryBlock}return createSuccess(${data}, ${successMessage})\n} catch (error) {\n  return handleError(error, ${errorMessage})\n}`;
    }
  );

  return content;
}

function processApiRoute(content: string): string {
  // Add imports
  if (!content.includes('import { withErrorHandling')) {
    content = content.replace(
      /import { NextResponse } from ["']next\/server["']/,
      'import { NextResponse } from "next/server"\nimport { withErrorHandling } from "@/lib/api-utils"'
    );
  }

  // Pattern for GET, POST, PUT, DELETE functions
  const httpMethodPattern = /(export async function (GET|POST|PUT|DELETE|PATCH))([^{]*){([^}]*)}/g;
  
  content = content.replace(httpMethodPattern, (match, exportDecl, method, args, body) => {
    // Skip if already using withErrorHandling
    if (body.includes('withErrorHandling')) {
      return match;
    }

    // Check if the body has authentication logic
    const hasAuth = body.includes('getAuth') || body.includes('userId');
    
    // Simple route with try/catch
    if (body.includes('try') && body.includes('catch') && !hasAuth) {
      return `${exportDecl}${args}{\n  return withErrorHandling(async () => {\n    ${body.replace(/try\s*{|}catch\s*\([^)]*\)\s*{|}\s*finally\s*{/g, '').replace(/return NextResponse\.json\([^)]*\)/g, 'return $1')}\n  });\n}`;
    }

    // More complex route with auth - we'll just add a note
    if (hasAuth) {
      return `${exportDecl}${args}{\n  // TODO: Migrate to withErrorHandling with authentication checks\n${body}\n}`;
    }

    return match;
  });

  return content;
}

for (const file of filesToProcess) {
  try {
    const content = fs.readFileSync(file, 'utf8');
    
    // Skip files that already use the new system
    if (content.includes('import { createSuccess, handleError') || 
        content.includes('import { handleError, createSuccess') || 
        content.includes('import { withErrorHandling')) {
      logger.info(`⏭️  Skipping ${path.relative(ROOT_DIR, file)} (already migrated)`);
      skippedCount++;
      continue;
    }
    
    let newContent = content;
    
    // Process based on file type
    if (file.includes('/actions/')) {
      newContent = processServerAction(content);
    } else if (file.includes('/api/')) {
      newContent = processApiRoute(content);
    }
    
    // Write changes if not in dry run mode
    if (!DRY_RUN && newContent !== content) {
      fs.writeFileSync(file, newContent, 'utf8');
      logger.info(`✅ Updated ${path.relative(ROOT_DIR, file)}`);
      processedCount++;
    } else if (newContent !== content) {
      logger.info(`🔍 Would update ${path.relative(ROOT_DIR, file)}`);
      processedCount++;
    } else {
      logger.info(`⏭️  No changes needed for ${path.relative(ROOT_DIR, file)}`);
      skippedCount++;
    }
  } catch (error) {
    logger.error(`❌ Error processing ${file}:`, error);
    errorCount++;
  }
}

logger.info(`
========================================
   Migration Summary
========================================
Files processed: ${processedCount}
Files skipped: ${skippedCount}
Errors: ${errorCount}
${DRY_RUN ? 'DRY RUN: No changes were made to files.' : 'Files have been updated.'}

Next steps:
1. Review the migrated files for any manual adjustments needed
2. Update client components to use the useAction() hook from @/lib/hooks/use-action
3. Add specific error codes and levels for better error classification
`);