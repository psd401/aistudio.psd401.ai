const { RDSDataClient, ExecuteStatementCommand } = require('@aws-sdk/client-rds-data');
const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');
const { SchedulerClient, CreateScheduleCommand, UpdateScheduleCommand, DeleteScheduleCommand } = require('@aws-sdk/client-scheduler');
const { buildToolsForScheduledExecution, collectEnabledToolsFromPrompts } = require('./tool-builder');

// Lambda logging utilities (simplified version of main app pattern)
function generateRequestId() {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

function startTimer(operation) {
  const startTime = Date.now();
  return (context = {}) => {
    const duration = Date.now() - startTime;
    // Use structured logging without console methods
    const logEntry = {
      level: 'INFO',
      message: 'Operation completed',
      operation,
      duration,
      timestamp: new Date().toISOString(),
      service: 'schedule-executor',
      ...sanitizeForLogging(context)
    };
    process.stdout.write(JSON.stringify(logEntry) + '\n');
  };
}

function createLogger(context = {}) {
  const baseContext = {
    timestamp: new Date().toISOString(),
    environment: 'lambda',
    service: 'schedule-executor',
    ...sanitizeForLogging(context)
  };

  return {
    info: (message, meta = {}) => {
      const logEntry = {
        level: 'INFO',
        message,
        ...baseContext,
        ...sanitizeForLogging(meta)
      };
      process.stdout.write(JSON.stringify(logEntry) + '\n');
    },
    error: (message, meta = {}) => {
      const logEntry = {
        level: 'ERROR',
        message,
        ...baseContext,
        ...sanitizeForLogging(meta)
      };
      process.stderr.write(JSON.stringify(logEntry) + '\n');
    },
    warn: (message, meta = {}) => {
      const logEntry = {
        level: 'WARN',
        message,
        ...baseContext,
        ...sanitizeForLogging(meta)
      };
      process.stderr.write(JSON.stringify(logEntry) + '\n');
    },
    debug: (message, meta = {}) => {
      const logEntry = {
        level: 'DEBUG',
        message,
        ...baseContext,
        ...sanitizeForLogging(meta)
      };
      process.stdout.write(JSON.stringify(logEntry) + '\n');
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
    const logEntry = {
      level: 'ERROR',
      message: 'Lambda startup failed - missing environment variables',
      missingVariables: missingVars,
      timestamp: new Date().toISOString(),
      service: 'schedule-executor'
    };
    process.stderr.write(JSON.stringify(logEntry) + '\n');
    throw new Error(errorMessage);
  }

  const logEntry = {
    level: 'INFO',
    message: 'Environment variables validated successfully',
    requiredVarsPresent: Object.keys(requiredEnvVars).length,
    optionalVarsPresent: Object.values(optionalEnvVars).filter(Boolean).length,
    timestamp: new Date().toISOString(),
    service: 'schedule-executor'
  };
  process.stdout.write(JSON.stringify(logEntry) + '\n');
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

  // Get streaming jobs queue URL (this should be configured via environment)
  const queueUrl = process.env.STREAMING_JOBS_QUEUE_URL;
  if (!queueUrl) {
    throw new Error('STREAMING_JOBS_QUEUE_URL environment variable not configured');
  }

  // Load assistant architect configuration and create proper streaming job
  const assistantArchitect = await loadAssistantArchitect(scheduledExecution.assistant_architect_id);
  if (!assistantArchitect) {
    throw new Error(`Assistant architect not found: ${scheduledExecution.assistant_architect_id}`);
  }

  // Create streaming job in database (following main app pattern)
  const streamingJobId = await createStreamingJob(
    scheduledExecution,
    assistantArchitect,
    executionResultId,
    requestId
  );

  log.info('Streaming job created for scheduled execution', {
    streamingJobId,
    executionResultId,
    scheduledExecutionId: scheduledExecution.id
  });

  // Send job ID to SQS queue for the streaming-jobs-worker to process
  try {
    await sqsClient.send(new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: streamingJobId, // Send just the job ID like regular jobs
      MessageAttributes: {
        jobType: {
          DataType: 'String',
          StringValue: 'ai-streaming-assistant-architect'
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
        },
        scheduledExecutionId: {
          DataType: 'String',
          StringValue: String(scheduledExecution.id)
        },
        isScheduledExecution: {
          DataType: 'String',
          StringValue: 'true'
        }
      }
    }));

    log.info('Job sent to streaming queue successfully', { streamingJobId });

    return { jobId: streamingJobId };
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
          executed_at,
          result_data
        ) VALUES (
          :scheduled_execution_id,
          'running',
          NOW(),
          '{}'::jsonb
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
          value: { stringValue: safeJsonStringify(resultData || {}) }
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

    const response = await schedulerClient.send(command);

    log.info('EventBridge schedule created successfully', { scheduleName });

    // Construct the schedule ARN with validation
    const region = process.env.AWS_REGION;
    if (!region) {
      throw new Error('AWS_REGION environment variable is required');
    }

    // Validate ARN format and extract account ID safely
    const arnParts = lambdaContext.invokedFunctionArn.split(':');
    if (arnParts.length < 5 || !arnParts[4].match(/^\d{12}$/)) {
      throw new Error('Invalid Lambda function ARN format');
    }
    const accountId = arnParts[4];

    const scheduleArn = `arn:aws:scheduler:${region}:${accountId}:schedule/default/${scheduleName}`;

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Schedule created successfully',
        scheduleName,
        scheduleArn,
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

/**
 * Load assistant architect configuration from database
 */
async function loadAssistantArchitect(assistantArchitectId) {
  const log = createLogger({ operation: 'loadAssistantArchitect' });

  try {
    const architectId = safeParseInt(assistantArchitectId, 'assistant architect ID');

    // First get the assistant architect details
    const architectCommand = new ExecuteStatementCommand({
      resourceArn: DATABASE_RESOURCE_ARN,
      secretArn: DATABASE_SECRET_ARN,
      database: DATABASE_NAME,
      sql: `
        SELECT id, name, description, status, user_id
        FROM assistant_architects
        WHERE id = :assistant_architect_id
      `,
      parameters: [
        { name: 'assistant_architect_id', value: { longValue: architectId } }
      ]
    });

    const architectResponse = await rdsClient.send(architectCommand);
    if (!architectResponse.records || architectResponse.records.length === 0) {
      return null;
    }

    const architectRecord = architectResponse.records[0];

    // Now get ALL prompts for this assistant architect
    const promptsCommand = new ExecuteStatementCommand({
      resourceArn: DATABASE_RESOURCE_ARN,
      secretArn: DATABASE_SECRET_ARN,
      database: DATABASE_NAME,
      sql: `
        SELECT
          cp.id,
          cp.name,
          cp.content,
          cp.system_context,
          cp.model_id,
          cp.position,
          cp.input_mapping,
          cp.enabled_tools,
          cp.repository_ids,
          m.model_id as model_string,
          m.provider,
          m.name as model_label
        FROM chain_prompts cp
        LEFT JOIN ai_models m ON cp.model_id = m.id
        WHERE cp.assistant_architect_id = :assistant_architect_id
        ORDER BY cp.position
      `,
      parameters: [
        { name: 'assistant_architect_id', value: { longValue: architectId } }
      ]
    });

    const promptsResponse = await rdsClient.send(promptsCommand);
    const prompts = [];

    if (promptsResponse.records && promptsResponse.records.length > 0) {
      for (const record of promptsResponse.records) {
        prompts.push({
          id: record[0].longValue,
          name: record[1].stringValue,
          content: record[2].stringValue,
          system_context: record[3]?.stringValue || null,
          model_id: record[4].longValue,
          position: record[5].longValue,
          input_mapping: record[6]?.stringValue ? safeJsonParse(record[6].stringValue, {}, 'input_mapping') : {},
          enabled_tools: record[7]?.stringValue ? safeJsonParse(record[7].stringValue, [], 'enabled_tools') : [],
          repository_ids: record[8]?.stringValue ? safeJsonParse(record[8].stringValue, [], 'repository_ids') : [],
          model_string: record[9]?.stringValue,
          provider: record[10]?.stringValue,
          model_label: record[11]?.stringValue
        });
      }
    }

    return {
      id: architectRecord[0].longValue,
      name: architectRecord[1].stringValue,
      description: architectRecord[2].stringValue,
      status: architectRecord[3].stringValue,
      user_id: architectRecord[4].longValue,
      prompts: prompts,
      // Note: Each prompt has its own model configuration - do not default to any single model
      instructions: prompts[0]?.content
    };
  } catch (error) {
    log.error('Failed to load assistant architect', {
      error: error.message,
      assistantArchitectId: sanitizeForLogging(assistantArchitectId)
    });
    throw error;
  }
}

/**
 * Safe JSON serialization with size limits and circular reference protection
 */
function safeJsonStringify(obj, maxSize = 1024 * 1024) { // 1MB limit
  try {
    // Check for circular references and handle special types
    const cache = new Set();
    const result = JSON.stringify(obj, (key, value) => {
      // Handle circular references
      if (typeof value === 'object' && value !== null) {
        if (cache.has(value)) {
          return '[Circular Reference]';
        }
        cache.add(value);
      }

      // Handle special types
      if (typeof value === 'function') return '[Function]';
      if (typeof value === 'bigint') return value.toString();
      if (value instanceof Error) return { error: value.message, stack: value.stack };
      if (value === undefined) return null;

      return value;
    });

    // Check size limit
    if (result.length > maxSize) {
      return JSON.stringify({
        error: 'Response too large',
        size: result.length,
        maxSize,
        truncated: true
      });
    }

    return result;
  } catch (error) {
    return JSON.stringify({
      error: 'JSON serialization failed',
      originalError: error.message
    });
  }
}

/**
 * Generate UUID for job ID (simplified version)
 */
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Create streaming job in database (similar to JobManagementService.createJob)
 */
async function createStreamingJob(scheduledExecution, assistantArchitect, executionResultId, requestId) {
  const log = createLogger({ operation: 'createStreamingJob', requestId });

  try {
    // Generate job ID
    const jobId = generateUUID();

    // Prepare fake conversation ID for scheduled jobs
    const conversationId = `scheduled-${scheduledExecution.id}`;

    // Collect enabled tools from all prompts
    const enabledTools = collectEnabledToolsFromPrompts(assistantArchitect.prompts || []);
    log.info('Collected enabled tools from prompts', {
      enabledTools,
      promptCount: assistantArchitect.prompts?.length || 0
    });

    // Build tools using the same system as manual execution
    // Use the first prompt's model/provider for tool building (since tools are shared across prompts)
    let tools = {};
    const firstPrompt = assistantArchitect.prompts?.[0];
    if (enabledTools.length > 0 && firstPrompt?.provider) {
      try {
        tools = await buildToolsForScheduledExecution(
          enabledTools,
          firstPrompt.model_string,
          firstPrompt.provider
        );
        log.info('Tools built successfully for scheduled execution', {
          enabledTools,
          toolCount: Object.keys(tools).length,
          toolNames: Object.keys(tools),
          usingModel: firstPrompt.model_string,
          usingProvider: firstPrompt.provider
        });
      } catch (toolError) {
        log.warn('Failed to build tools, continuing without tools', {
          error: toolError.message,
          enabledTools
        });
        tools = {};
      }
    }

    // Prepare request data for streaming job - SAME format as manual execution
    const requestData = {
      messages: [], // Empty messages for assistant architect
      modelId: firstPrompt?.model_id || 1,
      modelIdString: firstPrompt?.model_string,
      provider: firstPrompt?.provider,
      systemPrompt: assistantArchitect.instructions,
      options: {
        responseMode: 'standard'
      },
      source: 'assistant-architect',
      tools: tools, // Pass tools like manual execution does
      toolMetadata: {
        toolId: assistantArchitect.id,
        prompts: assistantArchitect.prompts || [], // Pass all prompts with tools
        inputMapping: scheduledExecution.input_data || {}
      },
      // Add metadata to identify this as a scheduled execution
      scheduledExecution: {
        executionResultId: executionResultId,
        scheduledExecutionId: scheduledExecution.id,
        scheduleName: scheduledExecution.name,
        userId: scheduledExecution.user_id
      }
    };

    log.info('Request data prepared for streaming job', {
      hasTools: Object.keys(tools).length > 0,
      toolCount: Object.keys(tools).length,
      promptCount: (assistantArchitect.prompts || []).length,
      enabledToolsCount: enabledTools.length
    });

    // Insert job into database
    const command = new ExecuteStatementCommand({
      resourceArn: DATABASE_RESOURCE_ARN,
      secretArn: DATABASE_SECRET_ARN,
      database: DATABASE_NAME,
      sql: `
        INSERT INTO ai_streaming_jobs (
          id,
          conversation_id,
          user_id,
          model_id,
          status,
          request_data
        ) VALUES (
          :id::uuid,
          :conversation_id,
          :user_id,
          :model_id,
          'pending',
          :request_data::jsonb
        )
      `,
      parameters: [
        { name: 'id', value: { stringValue: jobId } },
        { name: 'conversation_id', value: { stringValue: conversationId } },
        { name: 'user_id', value: { longValue: scheduledExecution.user_id } },
        { name: 'model_id', value: { longValue: firstPrompt?.model_id || 1 } },
        { name: 'request_data', value: { stringValue: safeJsonStringify(requestData) } }
      ]
    });

    await rdsClient.send(command);

    log.info('Streaming job created successfully', {
      jobId,
      assistantArchitectId: assistantArchitect.id,
      scheduledExecutionId: scheduledExecution.id,
      executionResultId,
      toolsIncluded: Object.keys(tools).length > 0,
      enabledTools
    });

    return jobId;
  } catch (error) {
    log.error('Failed to create streaming job', {
      error: error.message,
      assistantArchitectId: assistantArchitect?.id,
      scheduledExecutionId: scheduledExecution?.id
    });
    throw error;
  }
}