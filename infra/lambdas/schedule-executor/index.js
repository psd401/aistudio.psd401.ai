const { RDSDataClient, ExecuteStatementCommand } = require('@aws-sdk/client-rds-data');
const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');
const { SchedulerClient, CreateScheduleCommand, UpdateScheduleCommand, DeleteScheduleCommand } = require('@aws-sdk/client-scheduler');

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

// Environment variables with startup validation
const requiredEnvVars = {
  DATABASE_RESOURCE_ARN: process.env.DATABASE_RESOURCE_ARN,
  DATABASE_SECRET_ARN: process.env.DATABASE_SECRET_ARN,
  DATABASE_NAME: process.env.DATABASE_NAME,
  ENVIRONMENT: process.env.ENVIRONMENT,
  STREAMING_JOBS_QUEUE_URL: process.env.STREAMING_JOBS_QUEUE_URL
};

const optionalEnvVars = {
  DLQ_URL: process.env.DLQ_URL,
  SCHEDULER_EXECUTION_ROLE_ARN: process.env.SCHEDULER_EXECUTION_ROLE_ARN
};

// Validate required environment variables at startup
function validateEnvironmentVariables() {
  const missingVars = [];

  for (const [key, value] of Object.entries(requiredEnvVars)) {
    if (!value || value.trim() === '') {
      missingVars.push(key);
    }
  }

  if (missingVars.length > 0) {
    const errorMessage = `Missing required environment variables: ${missingVars.join(', ')}`;
    console.error(JSON.stringify({
      level: 'ERROR',
      message: 'Lambda startup failed - missing environment variables',
      missingVariables: missingVars,
      timestamp: new Date().toISOString(),
      service: 'schedule-executor'
    }));
    throw new Error(errorMessage);
  }

  console.log(JSON.stringify({
    level: 'INFO',
    message: 'Environment variables validated successfully',
    requiredVarsPresent: Object.keys(requiredEnvVars).length,
    optionalVarsPresent: Object.values(optionalEnvVars).filter(Boolean).length,
    timestamp: new Date().toISOString(),
    service: 'schedule-executor'
  }));
}

// Run validation at module load time
validateEnvironmentVariables();

// Export validated environment variables
const DATABASE_RESOURCE_ARN = requiredEnvVars.DATABASE_RESOURCE_ARN;
const DATABASE_SECRET_ARN = requiredEnvVars.DATABASE_SECRET_ARN;
const DATABASE_NAME = requiredEnvVars.DATABASE_NAME;
const ENVIRONMENT = requiredEnvVars.ENVIRONMENT;
const DLQ_URL = optionalEnvVars.DLQ_URL;

/**
 * Schedule Executor Lambda - EventBridge Scheduler Handler
 *
 * Handles two types of events:
 * 1. EventBridge Scheduled Events: Execute scheduled Assistant Architect workflows
 * 2. Direct Lambda Invocations: Schedule management operations (create/update/delete)
 *
 * For scheduled executions:
 * - Uses existing executeAssistantArchitectAction pattern
 * - Submits job to streaming-jobs-worker Lambda via SQS
 * - Stores results in execution_results table
 *
 * For schedule management:
 * - Direct Lambda invocations from API routes
 * - Create/update/delete EventBridge schedules
 * - Rate limiting (max 10 schedules per user)
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
      return await handleScheduleManagement(event, requestId, context);
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
 * Uses the existing assistant architect execution pattern
 */
async function handleScheduledExecution(scheduledExecutionId, requestId) {
  const log = createLogger({ requestId, scheduledExecutionId, operation: 'scheduledExecution' });
  const timer = startTimer('scheduled_execution');

  log.info('Processing scheduled execution', { scheduledExecutionId });

  let executionResultId = null;

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
    executionResultId = await createExecutionResult(scheduledExecutionId);

    // Execute using existing assistant architect pattern
    // This will create a streaming job and send it to SQS for the streaming-jobs-worker
    const result = await executeAssistantArchitectForSchedule(
      scheduledExecution,
      executionResultId,
      requestId
    );

    timer({ status: 'success' });
    log.info('Scheduled execution submitted successfully', {
      executionResultId,
      jobId: result.jobId
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Scheduled execution submitted successfully',
        scheduledExecutionId,
        executionResultId,
        jobId: result.jobId,
        status: 'submitted'
      })
    };

  } catch (error) {
    log.error('Scheduled execution failed', { error: error.message });

    // Update execution result with failure (only if we created one)
    if (executionResultId) {
      try {
        await updateExecutionResult(
          executionResultId,
          'failed',
          null,
          null,
          error.message
        );
      } catch (updateError) {
        log.error('Failed to update execution result with failure', { error: updateError.message });
      }
    }

    timer({ status: 'error' });
    throw error;
  }
}

/**
 * Execute assistant architect using existing pattern but adapted for Lambda
 */
async function executeAssistantArchitectForSchedule(scheduledExecution, executionResultId, requestId) {
  const log = createLogger({ requestId, executionResultId, operation: 'executeForSchedule' });

  log.info('Executing scheduled assistant architect', {
    assistantArchitectId: scheduledExecution.assistant_architect_id,
    inputData: Object.keys(scheduledExecution.input_data || {})
  });

  // This is a simplified version that creates a job directly and sends to SQS
  // The full execution will happen in the streaming-jobs-worker Lambda

  const jobId = generateRequestId(); // Simple job ID for tracking

  // Get streaming jobs queue URL (this should be configured via environment)
  const queueUrl = process.env.STREAMING_JOBS_QUEUE_URL;
  if (!queueUrl) {
    throw new Error('STREAMING_JOBS_QUEUE_URL environment variable not configured');
  }

  // Send job message to SQS for the streaming-jobs-worker to process
  const jobMessage = {
    jobId,
    type: 'assistant-architect-scheduled',
    assistantArchitectId: scheduledExecution.assistant_architect_id,
    userId: scheduledExecution.user_id,
    inputData: scheduledExecution.input_data || {},
    executionResultId,
    scheduledExecutionId: scheduledExecution.id,
    timestamp: new Date().toISOString()
  };

  try {
    await sqsClient.send(new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify(jobMessage),
      MessageAttributes: {
        jobType: {
          DataType: 'String',
          StringValue: 'assistant-architect-scheduled'
        },
        assistantArchitectId: {
          DataType: 'String',
          StringValue: String(scheduledExecution.assistant_architect_id)
        },
        userId: {
          DataType: 'String',
          StringValue: String(scheduledExecution.user_id)
        },
        executionResultId: {
          DataType: 'String',
          StringValue: String(executionResultId)
        }
      }
    }));

    log.info('Job sent to streaming queue successfully', { jobId });

    return { jobId };
  } catch (error) {
    log.error('Failed to send job to streaming queue', { error: error.message });
    throw error;
  }
}

/**
 * Load scheduled execution configuration from database
 */
async function loadScheduledExecution(scheduledExecutionId, expectedUserId = null) {
  const log = createLogger({ operation: 'loadScheduledExecution' });

  try {
    const executionId = safeParseInt(scheduledExecutionId, 'scheduled execution ID');

    const whereClause = expectedUserId != null
      ? 'WHERE se.id = :scheduled_execution_id AND se.user_id = :user_id'
      : 'WHERE se.id = :scheduled_execution_id';

    const parameters = [
      { name: 'scheduled_execution_id', value: { longValue: executionId } },
      ...(expectedUserId != null
        ? [{ name: 'user_id', value: { longValue: safeParseInt(expectedUserId, 'user ID') } }]
        : [])
    ];

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
          aa.name as assistant_architect_name
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
      assistant_architect_name: record[8].stringValue
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
 * Handle schedule management operations (create/update/delete)
 */
async function handleScheduleManagement(event, requestId, lambdaContext) {
  const log = createLogger({ requestId, operation: 'scheduleManagement' });
  const { action, ...params } = event;

  log.info('Processing schedule management action', { action });

  switch (action) {
    case 'create':
      return await createSchedule(params, requestId, lambdaContext);
    case 'update':
      return await updateSchedule(params, requestId, lambdaContext);
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
 * Create a new EventBridge schedule
 */
async function createSchedule(params, requestId, lambdaContext) {
  const log = createLogger({ requestId, operation: 'createSchedule' });
  const { scheduledExecutionId, cronExpression, timezone = 'UTC' } = params;

  log.info('Creating EventBridge schedule', { scheduledExecutionId, cronExpression, timezone });

  try {
    // Validate rate limiting
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
    const functionArn = lambdaContext.invokedFunctionArn;

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
async function updateSchedule(params, requestId, lambdaContext) {
  const log = createLogger({ requestId, operation: 'updateSchedule' });
  const { scheduledExecutionId, cronExpression, timezone = 'UTC' } = params;

  log.info('Updating EventBridge schedule', { scheduledExecutionId, cronExpression, timezone });

  try {
    const scheduleName = `aistudio-${ENVIRONMENT}-schedule-${scheduledExecutionId}`;
    const functionArn = lambdaContext.invokedFunctionArn;

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
    const userIdInt = safeParseInt(userId, 'user ID');

    const command = new ExecuteStatementCommand({
      resourceArn: DATABASE_RESOURCE_ARN,
      secretArn: DATABASE_SECRET_ARN,
      database: DATABASE_NAME,
      sql: 'SELECT COUNT(*) as count FROM scheduled_executions WHERE user_id = :user_id AND active = true',
      parameters: [
        { name: 'user_id', value: { longValue: userIdInt } }
      ]
    });

    const response = await rdsClient.send(command);
    return response.records[0][0].longValue || 0;
  } catch (error) {
    log.error('Failed to get user schedule count', {
      error: error.message,
      userId: sanitizeForLogging(userId)
    });
    throw error;
  }
}