import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";
/**
 * ESLint Configuration for AI Studio
 * 
 * LOGGING ENFORCEMENT:
 * - NO console.log/error/warn in server code (actions/, app/api/)
 * - Must use logger from @/lib/logger
 * - All server actions must generate requestId
 * - All async functions must have proper error handling
 * 
 * Custom rules defined in .eslintrc.custom.js:
 * - no-console-in-server: Prevents console usage in server code
 * - require-request-id-in-server-actions: Ensures request ID generation
 * - require-error-handling-in-async: Ensures try-catch or handleError
 * - no-generic-error-messages: Prevents "DB error" type messages
 * - use-typed-errors: Encourages ErrorFactories over plain Error
 * 
 * TODO: Migrate custom rules to flat config when ESLint plugin system stabilizes
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  // LOGGING ENFORCEMENT RULES
  // Rule 1: Disallow all console.* calls in server code
  {
    rules: {
      // All logging must use Winston logger in server code. No console.* allowed.
      'no-console': 'error',
    },
  },
  // Rule 2: Stricter rules for server actions and API routes
  {
    files: [
      "actions/**/*.ts",
      "actions/**/*.tsx",
      "app/api/**/*.ts",
      "app/api/**/*.tsx",
    ],
    rules: {
      // Enforce no console usage at all in server actions and API routes
      'no-console': 'error',
      // TODO: When custom rules are migrated to flat config:
      // 'custom/no-console-in-server': 'error',
      // 'custom/require-request-id-in-server-actions': 'error',
      // 'custom/require-error-handling-in-async': 'error',
      // 'custom/no-generic-error-messages': 'error',
      // 'custom/use-typed-errors': 'warn',
    },
  },
  // Rule 3: Allow console.error ONLY in client components/hooks
  {
    files: [
      "components/**/*.tsx",
      "components/**/*.ts",
      "lib/hooks/**/*.ts",
    ],
    rules: {
      // Allow console.error in client code for actionable errors only
      'no-console': [
        'error',
        { allow: ['error'] },
      ],
    },
  },
  // Rule 4: Special exceptions for Edge Runtime compatibility
  {
    files: [
      "lib/env-validation.ts",
      "middleware.ts",
    ],
    rules: {
      // These files need console for Edge Runtime compatibility
      // They should use eslint-disable-next-line comments
      'no-console': 'off',
    },
  },
];

export default eslintConfig;
