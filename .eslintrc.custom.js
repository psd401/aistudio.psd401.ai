/**
 * Custom ESLint rules for enforcing logging standards
 * These rules ensure consistent logging patterns across the codebase
 */

module.exports = {
  rules: {
    /**
     * Rule: no-console-in-server
     * Prevents use of console.log, console.error, etc. in server-side code
     * Must use the logger from @/lib/logger instead
     */
    'no-console-in-server': {
      meta: {
        type: 'problem',
        docs: {
          description: 'Disallow console.log in server actions and API routes - use logger instead',
          category: 'Best Practices',
        },
        fixable: 'code',
        schema: [],
        messages: {
          noConsole: 'Use logger from @/lib/logger instead of console.{{method}}',
        },
      },
      create(context) {
        return {
          MemberExpression(node) {
            const filename = context.getFilename();
            
            // Only apply to server-side code
            if (!filename.includes('/actions/') && 
                !filename.includes('/app/api/') &&
                !filename.includes('/lib/')) {
              return;
            }
            
            // Skip test files
            if (filename.includes('.test.') || filename.includes('.spec.')) {
              return;
            }
            
            if (
              node.object.name === 'console' &&
              ['log', 'error', 'warn', 'info', 'debug'].includes(node.property.name)
            ) {
              context.report({
                node,
                messageId: 'noConsole',
                data: {
                  method: node.property.name,
                },
              });
            }
          },
        };
      },
    },

    /**
     * Rule: require-request-id-in-server-actions
     * Ensures all server actions generate a request ID for tracing
     */
    'require-request-id-in-server-actions': {
      meta: {
        type: 'problem',
        docs: {
          description: 'Require request ID generation in server actions',
          category: 'Best Practices',
        },
        schema: [],
        messages: {
          missingRequestId: 'Server actions must generate a request ID using generateRequestId()',
        },
      },
      create(context) {
        let hasUseServer = false;
        let hasRequestId = false;
        let isInFunction = false;

        return {
          Literal(node) {
            if (node.value === 'use server') {
              hasUseServer = true;
            }
          },
          CallExpression(node) {
            if (node.callee.name === 'generateRequestId') {
              hasRequestId = true;
            }
          },
          FunctionDeclaration(node) {
            if (node.async && node.id && node.id.name.includes('Action')) {
              isInFunction = true;
            }
          },
          'FunctionDeclaration:exit'(node) {
            if (node.async && node.id && node.id.name.includes('Action')) {
              isInFunction = false;
              
              if (hasUseServer && !hasRequestId) {
                context.report({
                  node,
                  messageId: 'missingRequestId',
                });
              }
              
              hasRequestId = false;
            }
          },
          'Program:exit'() {
            hasUseServer = false;
          },
        };
      },
    },

    /**
     * Rule: require-error-handling-in-async
     * Ensures all async functions have proper error handling
     */
    'require-error-handling-in-async': {
      meta: {
        type: 'problem',
        docs: {
          description: 'Require try-catch or error handling in async functions',
          category: 'Error Handling',
        },
        schema: [],
        messages: {
          missingErrorHandling: 'Async function must have error handling (try-catch or handleError)',
        },
      },
      create(context) {
        return {
          FunctionDeclaration(node) {
            if (!node.async) return;
            
            const filename = context.getFilename();
            if (!filename.includes('/actions/') && !filename.includes('/app/api/')) {
              return;
            }

            const sourceCode = context.getSourceCode();
            const functionBody = sourceCode.getText(node.body);
            
            // Check for try-catch or handleError
            const hasTryCatch = /try\s*{/.test(functionBody);
            const hasHandleError = /handleError|withErrorHandling|withLogging/.test(functionBody);
            
            if (!hasTryCatch && !hasHandleError) {
              context.report({
                node,
                messageId: 'missingErrorHandling',
              });
            }
          },
        };
      },
    },

    /**
     * Rule: no-generic-error-messages
     * Prevents generic error messages like "DB error" or "Error occurred"
     */
    'no-generic-error-messages': {
      meta: {
        type: 'problem',
        docs: {
          description: 'Disallow generic error messages',
          category: 'Best Practices',
        },
        schema: [],
        messages: {
          genericError: 'Use specific, actionable error messages instead of "{{message}}"',
        },
      },
      create(context) {
        const genericMessages = [
          'DB error',
          'Database error',
          'Error occurred',
          'An error occurred',
          'Something went wrong',
          'Unknown error',
          'Error',
          'Failed',
        ];

        return {
          Literal(node) {
            if (typeof node.value !== 'string') return;
            
            const filename = context.getFilename();
            if (!filename.includes('/actions/') && !filename.includes('/app/api/')) {
              return;
            }

            const lowerValue = node.value.toLowerCase().trim();
            
            for (const generic of genericMessages) {
              if (lowerValue === generic.toLowerCase()) {
                context.report({
                  node,
                  messageId: 'genericError',
                  data: {
                    message: node.value,
                  },
                });
                break;
              }
            }
          },
        };
      },
    },

    /**
     * Rule: use-typed-errors
     * Encourages use of ErrorFactories instead of plain Error
     */
    'use-typed-errors': {
      meta: {
        type: 'suggestion',
        docs: {
          description: 'Use typed errors from ErrorFactories instead of plain Error',
          category: 'Best Practices',
        },
        schema: [],
        messages: {
          useTypedError: 'Consider using ErrorFactories instead of throwing plain Error',
        },
      },
      create(context) {
        return {
          ThrowStatement(node) {
            const filename = context.getFilename();
            if (!filename.includes('/actions/') && !filename.includes('/app/api/')) {
              return;
            }

            if (
              node.argument.type === 'NewExpression' &&
              node.argument.callee.name === 'Error'
            ) {
              context.report({
                node,
                messageId: 'useTypedError',
              });
            }
          },
        };
      },
    },
  },
};