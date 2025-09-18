const { RDSDataClient, ExecuteStatementCommand } = require('@aws-sdk/client-rds-data');
const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');
const { SchedulerClient, CreateScheduleCommand, UpdateScheduleCommand, DeleteScheduleCommand } = require('@aws-sdk/client-scheduler');
const { UnifiedStreamingService, createSettingsManager } = require('@aistudio/streaming-core');

// Lambda logging utilities (simplified version of main app pattern)
function generateRequestId() {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

function startTimer(operation) {
  const startTime = Date.now();
  return (context = {}) => {
    const duration = Date.now() - startTime;
    console.log(JSON.stringify({
      level: 'INFO',
      message: 'Operation completed',
      operation,
      duration,
      timestamp: new Date().toISOString(),
      ...context
    }));
  };
}

function createLogger(context = {}) {
  const baseContext = {
    timestamp: new Date().toISOString(),
    environment: 'lambda',
    service: 'schedule-executor',
    ...context
  };

  return {
    info: (message, meta = {}) => {
      console.log(JSON.stringify({
        level: 'INFO',
        message,
        ...baseContext,
        ...meta
      }));
    },
    error: (message, meta = {}) => {
      console.error(JSON.stringify({
        level: 'ERROR',
        message,
        ...baseContext,
        ...meta
      }));
    },
    warn: (message, meta = {}) => {
      console.warn(JSON.stringify({
        level: 'WARN',
        message,
        ...baseContext,
        ...meta
      }));
    },
    debug: (message, meta = {}) => {
      console.log(JSON.stringify({
        level: 'DEBUG',
        message,
        ...baseContext,
        ...meta
      }));
    }
  };
}

// Security utility functions
function safeParseInt(value, fieldName = 'value') {
  if (value === null || value === undefined) {
    throw new Error(`Invalid ${fieldName}: value is null or undefined`);
  }

  const stringValue = String(value).trim();
  if (stringValue === '') {
    throw new Error(`Invalid ${fieldName}: empty string`);
  }

  const parsed = parseInt(stringValue, 10);
  if (isNaN(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${fieldName}: must be a positive integer`);
  }

  return parsed;
}

function safeJsonParse(jsonString, fallback = null, fieldName = 'JSON data') {
  if (!jsonString) {
    return fallback;
  }

  try {
    return JSON.parse(jsonString);
  } catch (error) {
    const log = createLogger({ operation: 'safeJsonParse' });
    log.error('JSON parse error', {
      fieldName,
      error: error.message,
      jsonLength: jsonString?.length
    });
    return fallback;
  }
}

function sanitizeForLogging(data) {
  if (!data || typeof data !== 'object') {
    return data;
  }

  const sensitiveKeys = ['password', 'token', 'secret', 'key', 'auth', 'credential'];
  const sanitized = { ...data };

  for (const key of Object.keys(sanitized)) {
    if (sensitiveKeys.some(sensitive => key.toLowerCase().includes(sensitive))) {
      sanitized[key] = '[REDACTED]';
    }
  }

  return sanitized;
}

// Initialize clients
const rdsClient = new RDSDataClient({});
const sqsClient = new SQSClient({});
const schedulerClient = new SchedulerClient({});

// Environment variables
const DATABASE_RESOURCE_ARN = process.env.DATABASE_RESOURCE_ARN;
const DATABASE_SECRET_ARN = process.env.DATABASE_SECRET_ARN;
const DATABASE_NAME = process.env.DATABASE_NAME;
const ENVIRONMENT = process.env.ENVIRONMENT;
const DLQ_URL = process.env.DLQ_URL;

// Initialize unified streaming service with database-backed settings
const settingsManager = createSettingsManager(async (key) => {
  const command = new ExecuteStatementCommand({
    resourceArn: DATABASE_RESOURCE_ARN,
    secretArn: DATABASE_SECRET_ARN,
    database: DATABASE_NAME,
    sql: `SELECT value FROM settings WHERE key = :key LIMIT 1`,
    parameters: [
      { name: 'key', value: { stringValue: key } }
    ]
  });

  try {
    const response = await rdsClient.send(command);
    if (response.records && response.records.length > 0) {
      return response.records[0][0].stringValue;
    }
    return null;
  } catch (error) {
    const log = createLogger({ operation: 'getSetting' });
    log.error('Failed to get setting', { key, error: error.message });
    return null;
  }
});

const unifiedStreamingService = new UnifiedStreamingService(settingsManager);

/**
 * Schedule Executor Lambda - EventBridge Scheduler Handler
 *
 * Handles two types of events:
 * 1. EventBridge Scheduled Events: Execute scheduled Assistant Architect workflows
 * 2. Direct Lambda Invocations: Schedule management operations (create/update/delete)
 *
 * For scheduled executions:
 * - Triggered by EventBridge with `scheduled_execution_id` in input
 * - Fetches execution config from database
 * - Executes Assistant Architect workflow using existing patterns
 * - Stores results in `execution_results` table
 * - Handles errors with retry logic and DLQ
 *
 * For schedule management:
 * - Direct Lambda invocations from API routes
 * - Create/update/delete EventBridge schedules
 * - Rate limiting (max 10 schedules per user)
 * - Timezone conversion support
 */
exports.handler = async (event, context) => {
  const requestId = generateRequestId();
  const timer = startTimer('lambda.handler');
  const log = createLogger({ requestId, operation: 'scheduleExecutor' });

  log.info('ScheduleExecutor Lambda started', {
    hasEventBridgeSource: event.source === 'aws.scheduler',
    hasScheduledExecutionId: !!event.scheduledExecutionId,
    hasDirectInvocation: !!event.action,
    environment: ENVIRONMENT
  });

  try {
    // Check if this is an EventBridge scheduled event
    if (event.source === 'aws.scheduler' && event.scheduledExecutionId) {
      // Handle scheduled execution
      return await handleScheduledExecution(event.scheduledExecutionId, requestId);
    }

    // Check if this is a direct invocation for schedule management
    if (event.action) {
      return await handleScheduleManagement(event, requestId);
    }

    // Unknown event type
    log.error('Unknown event type', { event });
    return {
      statusCode: 400,
      body: JSON.stringify({
        error: 'Unknown event type',
        supported: ['scheduled_execution', 'schedule_management']
      })
    };

  } catch (error) {
    log.error('Schedule executor failed', {
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      requestId
    });
    timer({ status: 'error' });

    // Send to DLQ if available
    if (DLQ_URL) {
      try {
        await sqsClient.send(new SendMessageCommand({
          QueueUrl: DLQ_URL,
          MessageBody: JSON.stringify({
            originalEvent: event,
            error: error.message,
            timestamp: new Date().toISOString(),
            requestId
          })
        }));
      } catch (dlqError) {
        log.error('Failed to send to DLQ', { error: dlqError.message });
      }
    }

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Internal server error',
        requestId
      })
    };
  }
};

/**
 * Handle scheduled execution triggered by EventBridge
 */
async function handleScheduledExecution(scheduledExecutionId, requestId) {
  const log = createLogger({ requestId, scheduledExecutionId, operation: 'scheduledExecution' });
  const timer = startTimer('scheduled_execution');

  log.info('Processing scheduled execution', { scheduledExecutionId });

  try {
    // Load scheduled execution config from database
    const scheduledExecution = await loadScheduledExecution(scheduledExecutionId);
    if (!scheduledExecution) {
      log.error('Scheduled execution not found', { scheduledExecutionId });
      return {
        statusCode: 404,
        body: JSON.stringify({
          error: 'Scheduled execution not found',
          scheduledExecutionId
        })
      };
    }

    // Check if execution is active
    if (!scheduledExecution.active) {
      log.warn('Scheduled execution is inactive', { scheduledExecutionId });
      return {
        statusCode: 200,
        body: JSON.stringify({
          message: 'Scheduled execution is inactive',
          scheduledExecutionId,
          skipped: true
        })
      };
    }

    log.info('Scheduled execution loaded', {
      name: scheduledExecution.name,
      userId: scheduledExecution.user_id,
      assistantArchitectId: scheduledExecution.assistant_architect_id,
      hasInputData: !!scheduledExecution.input_data
    });

    // Create execution result record
    const executionResultId = await createExecutionResult(scheduledExecutionId);

    // Execute Assistant Architect workflow
    const startTime = Date.now();
    const result = await executeAssistantArchitectWorkflow(
      scheduledExecution,
      executionResultId,
      requestId
    );
    const executionDuration = Date.now() - startTime;

    // Update execution result with completion
    await updateExecutionResult(
      executionResultId,
      'completed',
      result,
      executionDuration
    );

    timer({ status: 'success' });
    log.info('Scheduled execution completed successfully', {
      executionResultId,
      duration: executionDuration,
      hasResult: !!result
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Scheduled execution completed successfully',
        scheduledExecutionId,
        executionResultId,
        duration: executionDuration,
        status: 'completed'
      })
    };

  } catch (error) {
    log.error('Scheduled execution failed', { error: error.message, stack: error.stack });

    // Update execution result with failure
    try {
      const executionResultId = await createExecutionResult(scheduledExecutionId);
      await updateExecutionResult(
        executionResultId,
        'failed',
        null,
        Date.now() - timer.startTime,
        error.message
      );
    } catch (updateError) {
      log.error('Failed to update execution result with failure', { error: updateError.message });
    }

    timer({ status: 'error' });
    throw error;
  }
}

/**
 * Handle schedule management operations (create/update/delete)
 */
async function handleScheduleManagement(event, requestId) {
  const log = createLogger({ requestId, operation: 'scheduleManagement' });
  const { action, ...params } = event;

  log.info('Processing schedule management action', { action });

  switch (action) {
    case 'create':
      return await createSchedule(params, requestId);
    case 'update':
      return await updateSchedule(params, requestId);
    case 'delete':
      return await deleteSchedule(params, requestId);
    default:
      log.error('Unknown schedule management action', { action });
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: 'Unknown action',
          supported: ['create', 'update', 'delete']
        })
      };
  }
}

/**
 * Load scheduled execution configuration from database
 * @param {string|number} scheduledExecutionId - The execution ID to load
 * @param {string|number} [expectedUserId] - Optional user ID for authorization check
 */
async function loadScheduledExecution(scheduledExecutionId, expectedUserId = null) {
  const log = createLogger({ operation: 'loadScheduledExecution' });

  try {
    // Validate and sanitize input
    const executionId = safeParseInt(scheduledExecutionId, 'scheduled execution ID');

    // Build SQL with conditional user authorization
    const whereClause = expectedUserId
      ? 'WHERE se.id = :scheduled_execution_id AND se.user_id = :user_id'
      : 'WHERE se.id = :scheduled_execution_id';

    const parameters = [
      { name: 'scheduled_execution_id', value: { longValue: executionId } }
    ];

    if (expectedUserId) {
      const userId = safeParseInt(expectedUserId, 'user ID');
      parameters.push({ name: 'user_id', value: { longValue: userId } });
    }

    const command = new ExecuteStatementCommand({
      resourceArn: DATABASE_RESOURCE_ARN,
      secretArn: DATABASE_SECRET_ARN,
      database: DATABASE_NAME,
      sql: `
        SELECT
          se.id,
          se.user_id,
          se.assistant_architect_id,
          se.name,
          se.schedule_config,
          se.input_data,
          se.active,
          se.created_at,
          aa.name as assistant_architect_name,
          aa.prompts
        FROM scheduled_executions se
        JOIN assistant_architects aa ON se.assistant_architect_id = aa.id
        ${whereClause}
      `,
      parameters
    });

    const response = await rdsClient.send(command);

    if (!response.records || response.records.length === 0) {
      return null;
    }

    const record = response.records[0];

    return {
      id: record[0].longValue,
      user_id: record[1].longValue,
      assistant_architect_id: record[2].longValue,
      name: record[3].stringValue,
      schedule_config: safeJsonParse(record[4].stringValue, {}, 'schedule_config'),
      input_data: record[5].stringValue ? safeJsonParse(record[5].stringValue, {}, 'input_data') : {},
      active: record[6].booleanValue,
      created_at: record[7].stringValue,
      assistant_architect_name: record[8].stringValue,
      prompts: safeJsonParse(record[9].stringValue, [], 'prompts')
    };
  } catch (error) {
    log.error('Failed to load scheduled execution', {
      error: error.message,
      scheduledExecutionId: sanitizeForLogging(scheduledExecutionId)
    });
    throw error;
  }
}

/**
 * Create execution result record
 */
async function createExecutionResult(scheduledExecutionId) {
  const log = createLogger({ operation: 'createExecutionResult' });

  try {
    const executionId = safeParseInt(scheduledExecutionId, 'scheduled execution ID');

    const command = new ExecuteStatementCommand({
      resourceArn: DATABASE_RESOURCE_ARN,
      secretArn: DATABASE_SECRET_ARN,
      database: DATABASE_NAME,
      sql: `
        INSERT INTO execution_results (
          scheduled_execution_id,
          status,
          executed_at
        ) VALUES (
          :scheduled_execution_id,
          'running',
          NOW()
        )
        RETURNING id
      `,
      parameters: [
        { name: 'scheduled_execution_id', value: { longValue: executionId } }
      ]
    });

    const response = await rdsClient.send(command);
    return response.records[0][0].longValue;
  } catch (error) {
    log.error('Failed to create execution result', {
      error: error.message,
      scheduledExecutionId: sanitizeForLogging(scheduledExecutionId)
    });
    throw error;
  }
}

/**
 * Update execution result with completion status
 */
async function updateExecutionResult(executionResultId, status, resultData = null, executionDuration = null, errorMessage = null) {
  const log = createLogger({ operation: 'updateExecutionResult' });

  try {
    const resultId = safeParseInt(executionResultId, 'execution result ID');

    const command = new ExecuteStatementCommand({
      resourceArn: DATABASE_RESOURCE_ARN,
      secretArn: DATABASE_SECRET_ARN,
      database: DATABASE_NAME,
      sql: `
        UPDATE execution_results
        SET
          status = :status,
          result_data = :result_data::jsonb,
          execution_duration_ms = :execution_duration_ms,
          error_message = :error_message,
          executed_at = NOW()
        WHERE id = :execution_result_id
        RETURNING id
      `,
      parameters: [
        { name: 'execution_result_id', value: { longValue: resultId } },
        { name: 'status', value: { stringValue: status } },
        {
          name: 'result_data',
          value: resultData ? { stringValue: JSON.stringify(resultData) } : { isNull: true }
        },
        {
          name: 'execution_duration_ms',
          value: executionDuration ? { longValue: executionDuration } : { isNull: true }
        },
        {
          name: 'error_message',
          value: errorMessage ? { stringValue: errorMessage } : { isNull: true }
        }
      ]
    });

    const response = await rdsClient.send(command);
    const success = response.records && response.records.length > 0;

    if (!success) {
      throw new Error('Execution result update failed - no rows updated');
    }

    log.info('Execution result updated successfully', {
      executionResultId: resultId,
      status
    });
    return true;
  } catch (error) {
    log.error('Failed to update execution result', {
      error: error.message,
      executionResultId: sanitizeForLogging(executionResultId),
      status
    });
    throw error;
  }
}

/**
 * Execute Assistant Architect workflow using existing patterns
 */
async function executeAssistantArchitectWorkflow(scheduledExecution, executionResultId, requestId) {
  const log = createLogger({ requestId, executionResultId, operation: 'executeWorkflow' });

  log.info('Executing Assistant Architect workflow', {
    workflowName: scheduledExecution.name,
    assistantArchitectId: scheduledExecution.assistant_architect_id,
    promptCount: scheduledExecution.prompts?.length || 0
  });

  try {
    // Extract configuration
    const { prompts, input_data: inputData = {} } = scheduledExecution;

    if (!prompts || !Array.isArray(prompts) || prompts.length === 0) {
      throw new Error('No prompts found in Assistant Architect configuration');
    }

    // Sort prompts by position to ensure correct execution order
    const sortedPrompts = [...prompts].sort((a, b) => a.position - b.position);

    log.info(`Executing ${sortedPrompts.length} prompts in sequence`);

    // Track context for variable substitution between prompts
    let chainContext = { ...inputData };
    let finalResult = null;

    // Execute prompts sequentially
    for (let i = 0; i < sortedPrompts.length; i++) {
      const prompt = sortedPrompts[i];
      const isLastPrompt = i === sortedPrompts.length - 1;

      log.info(`Executing prompt ${i + 1}/${sortedPrompts.length}: ${prompt.name}`);

      try {
        // Substitute variables in prompt content
        const processedContent = substituteVariables(prompt.content, chainContext);

        // Build messages for this specific prompt
        const promptMessages = [
          {
            role: 'user',
            parts: [{ type: 'text', text: processedContent }]
          }
        ];

        // Create streaming request using shared core interface
        const streamRequest = {
          messages: promptMessages,
          modelId: 'gpt-4o', // Default model for scheduled executions
          provider: 'openai', // Default provider for scheduled executions
          userId: scheduledExecution.user_id.toString(),
          sessionId: `scheduled-${executionResultId}-prompt-${prompt.id}`,
          source: 'scheduled-execution',
          systemPrompt: prompt.system_context || '',
          options: {
            reasoningEffort: 'medium',
            responseMode: 'standard',
            maxTokens: 4000,
            temperature: 0.7
          },
          callbacks: {
            onFinish: async ({ text, usage, finishReason }) => {
              log.info(`Prompt ${prompt.name} finished`, {
                hasText: !!text,
                textLength: text?.length || 0,
                finishReason
              });
            }
          }
        };

        // Execute the prompt using unified streaming service
        const streamResponse = await unifiedStreamingService.stream(streamRequest);
        const promptResult = await streamResponse.result;

        // Extract final text result
        let finalText = '';
        if (promptResult.text && typeof promptResult.text.then === 'function') {
          finalText = await promptResult.text;
        } else if (typeof promptResult.text === 'string') {
          finalText = promptResult.text;
        } else {
          finalText = String(promptResult.text || '');
        }

        // Add prompt output to chain context for next prompts
        chainContext[`prompt_${prompt.position}_output`] = finalText;
        chainContext[`${prompt.name.toLowerCase().replace(/\\s+/g, '_')}_output`] = finalText;

        log.info(`Prompt ${prompt.name} completed successfully`, {
          outputLength: finalText.length,
          contextKeys: Object.keys(chainContext).length
        });

        // Store final result from last prompt
        if (isLastPrompt) {
          finalResult = {
            type: 'scheduled_assistant_architect',
            text: finalText,
            finalOutput: finalText,
            chainContext: chainContext,
            totalPrompts: sortedPrompts.length,
            executionId: executionResultId,
            usage: {
              promptTokens: promptResult.usage?.promptTokens || 0,
              completionTokens: promptResult.usage?.completionTokens || 0,
              totalTokens: promptResult.usage?.totalTokens || 0
            },
            finishReason: promptResult.finishReason || 'stop'
          };
        }

      } catch (promptError) {
        log.error(`Error executing prompt ${prompt.name}:`, { error: promptError.message });
        throw new Error(`Prompt execution failed at step ${i + 1} (${prompt.name}): ${promptError.message}`);
      }
    }

    log.info('Assistant Architect workflow completed successfully', {
      promptsExecuted: sortedPrompts.length,
      contextVariables: Object.keys(chainContext).length,
      hasResult: !!finalResult
    });

    return finalResult;

  } catch (error) {
    log.error('Assistant Architect workflow execution failed', { error: error.message });
    throw error;
  }
}

/**
 * Create a new EventBridge schedule
 */
async function createSchedule(params, requestId) {
  const log = createLogger({ requestId, operation: 'createSchedule' });
  const { scheduledExecutionId, cronExpression, timezone = 'UTC' } = params;

  log.info('Creating EventBridge schedule', { scheduledExecutionId, cronExpression, timezone });

  try {
    // Validate rate limiting (max 10 schedules per user)
    const userScheduleCount = await getUserScheduleCount(params.userId);
    if (userScheduleCount >= 10) {
      return {
        statusCode: 429,
        body: JSON.stringify({
          error: 'Rate limit exceeded',
          message: 'Maximum 10 schedules per user allowed'
        })
      };
    }

    const scheduleName = `aistudio-${ENVIRONMENT}-schedule-${scheduledExecutionId}`;
    // Get function ARN from environment or context
    const functionArn = process.env.AWS_LAMBDA_FUNCTION_NAME ?
      `arn:aws:lambda:${process.env.AWS_REGION}:${process.env.AWS_ACCOUNT_ID}:function:${process.env.AWS_LAMBDA_FUNCTION_NAME}` :
      process.env.SCHEDULE_EXECUTOR_FUNCTION_ARN;

    const command = new CreateScheduleCommand({
      Name: scheduleName,
      ScheduleExpression: `cron(${cronExpression})`,
      ScheduleExpressionTimezone: timezone,
      FlexibleTimeWindow: {
        Mode: 'FLEXIBLE',
        MaximumWindowInMinutes: 5
      },
      Target: {
        Arn: functionArn,
        RoleArn: process.env.SCHEDULER_EXECUTION_ROLE_ARN,
        Input: JSON.stringify({
          source: 'aws.scheduler',
          scheduledExecutionId: scheduledExecutionId
        })
      },
      State: 'ENABLED'
    });

    await schedulerClient.send(command);

    log.info('EventBridge schedule created successfully', { scheduleName });

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Schedule created successfully',
        scheduleName,
        scheduledExecutionId
      })
    };

  } catch (error) {
    log.error('Failed to create EventBridge schedule', { error: error.message });
    throw error;
  }
}

/**
 * Update an existing EventBridge schedule
 */
async function updateSchedule(params, requestId) {
  const log = createLogger({ requestId, operation: 'updateSchedule' });
  const { scheduledExecutionId, cronExpression, timezone = 'UTC' } = params;

  log.info('Updating EventBridge schedule', { scheduledExecutionId, cronExpression, timezone });

  try {
    const scheduleName = `aistudio-${ENVIRONMENT}-schedule-${scheduledExecutionId}`;
    // Get function ARN from environment or context
    const functionArn = process.env.AWS_LAMBDA_FUNCTION_NAME ?
      `arn:aws:lambda:${process.env.AWS_REGION}:${process.env.AWS_ACCOUNT_ID}:function:${process.env.AWS_LAMBDA_FUNCTION_NAME}` :
      process.env.SCHEDULE_EXECUTOR_FUNCTION_ARN;

    const command = new UpdateScheduleCommand({
      Name: scheduleName,
      ScheduleExpression: `cron(${cronExpression})`,
      ScheduleExpressionTimezone: timezone,
      FlexibleTimeWindow: {
        Mode: 'FLEXIBLE',
        MaximumWindowInMinutes: 5
      },
      Target: {
        Arn: functionArn,
        RoleArn: process.env.SCHEDULER_EXECUTION_ROLE_ARN,
        Input: JSON.stringify({
          source: 'aws.scheduler',
          scheduledExecutionId: scheduledExecutionId
        })
      },
      State: 'ENABLED'
    });

    await schedulerClient.send(command);

    log.info('EventBridge schedule updated successfully', { scheduleName });

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Schedule updated successfully',
        scheduleName,
        scheduledExecutionId
      })
    };

  } catch (error) {
    log.error('Failed to update EventBridge schedule', { error: error.message });
    throw error;
  }
}

/**
 * Delete an EventBridge schedule
 */
async function deleteSchedule(params, requestId) {
  const log = createLogger({ requestId, operation: 'deleteSchedule' });
  const { scheduledExecutionId } = params;

  log.info('Deleting EventBridge schedule', { scheduledExecutionId });

  try {
    const scheduleName = `aistudio-${ENVIRONMENT}-schedule-${scheduledExecutionId}`;

    const command = new DeleteScheduleCommand({
      Name: scheduleName
    });

    await schedulerClient.send(command);

    log.info('EventBridge schedule deleted successfully', { scheduleName });

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Schedule deleted successfully',
        scheduleName,
        scheduledExecutionId
      })
    };

  } catch (error) {
    log.error('Failed to delete EventBridge schedule', { error: error.message });
    throw error;
  }
}

/**
 * Get user schedule count for rate limiting
 */
async function getUserScheduleCount(userId) {
  const log = createLogger({ operation: 'getUserScheduleCount' });

  try {
    const validUserId = safeParseInt(userId, 'user ID');

    const command = new ExecuteStatementCommand({
      resourceArn: DATABASE_RESOURCE_ARN,
      secretArn: DATABASE_SECRET_ARN,
      database: DATABASE_NAME,
      sql: `
        SELECT COUNT(*) as count
        FROM scheduled_executions
        WHERE user_id = :user_id AND active = true
      `,
      parameters: [
        { name: 'user_id', value: { longValue: validUserId } }
      ]
    });

    const response = await rdsClient.send(command);
    return response.records[0][0].longValue;
  } catch (error) {
    log.error('Failed to get user schedule count', {
      error: error.message,
      userId: sanitizeForLogging(userId)
    });
    return 0; // Safe fallback for rate limiting
  }
}

/**
 * Substitute variables in prompt content using chain context
 * Supports both {{variable}} and {variable} patterns
 *
 * Security considerations:
 * - Variable names are validated (alphanumeric, underscore, hyphen only)
 * - No content sanitization to preserve code, JSON, and other structured data
 * - No length limits to allow large outputs from previous prompts
 * - This is template substitution for AI prompts, not user-facing HTML rendering
 */
function substituteVariables(content, context) {
  if (!content || !context) return content;

  let processedContent = content;

  // Validate context variable names and prepare values for substitution
  const validatedContext = {};
  for (const [key, value] of Object.entries(context)) {
    // Security: Validate variable name format to prevent injection attacks
    // Only allow alphanumeric characters, underscores, and hyphens
    if (!/^[a-zA-Z0-9_-]+$/.test(key)) {
      const log = createLogger({ operation: 'substituteVariables' });
      log.warn('Invalid variable name - skipping', { variableName: key });
      continue;
    }

    // Security: Prevent excessively long variable names (potential DoS)
    if (key.length > 100) {
      const log = createLogger({ operation: 'substituteVariables' });
      log.warn('Variable name too long - skipping', { variableName: key, length: key.length });
      continue;
    }

    if (typeof value === 'string') {
      // No character sanitization - preserve all content including code
      // No length limits - allow large outputs from previous prompts
      validatedContext[key] = value;
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      validatedContext[key] = String(value);
    } else if (value === null || value === undefined) {
      validatedContext[key] = '';
    } else {
      // Convert objects/arrays to JSON, preserving structure
      try {
        validatedContext[key] = JSON.stringify(value, null, 2);
      } catch (error) {
        const log = createLogger({ operation: 'substituteVariables' });
        log.warn('Failed to serialize variable', { variableName: key, error: error.message });
        validatedContext[key] = String(value);
      }
    }
  }

  // Replace variables with double braces: {{variable}}
  processedContent = processedContent.replace(/\{\{([^}]+)\}\}/g, (match, variableName) => {
    const trimmedName = variableName.trim();

    // Validate variable name format
    if (!/^[a-zA-Z0-9_-]+$/.test(trimmedName)) {
      const log = createLogger({ operation: 'substituteVariables' });
      log.warn('Invalid variable name format in double braces - leaving as-is', { variableName: trimmedName });
      return match;
    }

    if (validatedContext.hasOwnProperty(trimmedName)) {
      return validatedContext[trimmedName];
    }
    const log = createLogger({ operation: 'substituteVariables' });
    log.warn('Variable not found in context - leaving as-is', { variableName: trimmedName, pattern: 'double-braces' });
    return match; // Leave as-is if variable not found
  });

  // Replace variables with single braces: {variable}
  processedContent = processedContent.replace(/\{([^}]+)\}/g, (match, variableName) => {
    const trimmedName = variableName.trim();

    // Validate variable name format
    if (!/^[a-zA-Z0-9_-]+$/.test(trimmedName)) {
      const log = createLogger({ operation: 'substituteVariables' });
      log.warn('Invalid variable name format in single braces - leaving as-is', { variableName: trimmedName });
      return match;
    }

    if (validatedContext.hasOwnProperty(trimmedName)) {
      return validatedContext[trimmedName];
    }
    const log = createLogger({ operation: 'substituteVariables' });
    log.warn('Variable not found in context - leaving as-is', { variableName: trimmedName, pattern: 'single-braces' });
    return match; // Leave as-is if variable not found
  });

  return processedContent;
}