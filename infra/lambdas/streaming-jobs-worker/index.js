const { RDSDataClient, ExecuteStatementCommand } = require('@aws-sdk/client-rds-data');
const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { SSMClient, GetParameterCommand } = require('@aws-sdk/client-ssm');
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
    service: 'streaming-jobs-worker',
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

// Initialize clients
const rdsClient = new RDSDataClient({});
const sqsClient = new SQSClient({});
const s3Client = new S3Client({});
const ssmClient = new SSMClient({});

// Environment variables
const DATABASE_RESOURCE_ARN = process.env.DATABASE_RESOURCE_ARN;
const DATABASE_SECRET_ARN = process.env.DATABASE_SECRET_ARN;
const DATABASE_NAME = process.env.DATABASE_NAME;
const STREAMING_QUEUE_URL = process.env.STREAMING_QUEUE_URL;
const DOCUMENTS_BUCKET = process.env.DOCUMENTS_BUCKET_NAME;

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

// S3 Attachment Helper Functions
/**
 * Retrieve attachment content from S3
 */
async function getAttachmentFromS3(s3Key) {
  try {
    const response = await s3Client.send(new GetObjectCommand({
      Bucket: DOCUMENTS_BUCKET,
      Key: s3Key,
    }));
    
    if (!response.Body) {
      throw new Error('No content returned from S3');
    }
    
    const bodyText = await response.Body.transformToString();
    const attachmentData = JSON.parse(bodyText);
    
    console.log('Attachment retrieved from S3', {
      s3Key,
      type: attachmentData.type,
      size: bodyText.length
    });
    
    return attachmentData;
  } catch (error) {
    console.error('Failed to retrieve attachment from S3', {
      s3Key,
      error: error.message
    });
    throw new Error(`Failed to retrieve attachment: ${error.message}`);
  }
}

/**
 * Reconstruct full messages with attachment data from S3
 * Now handles both parts array (AI SDK v5) and content array formats
 */
async function reconstructMessagesWithAttachments(lightweightMessages, attachmentReferences) {
  const fullMessages = [];
  
  for (const message of lightweightMessages) {
    // Handle AI SDK v5 format (parts array)
    if (Array.isArray(message.parts)) {
      const fullParts = [];
      
      for (const part of message.parts) {
        if (part.type === 'image' && part.image?.startsWith('s3://')) {
          // Extract S3 key from s3://key format
          const s3Key = part.image.replace('s3://', '');
          
          try {
            console.log(`Reconstructing image from S3: ${s3Key}`);
            const attachmentData = await getAttachmentFromS3(s3Key);
            
            // Create proper FileUIPart with base64 data (AI SDK v5 format)
            const dataUrl = attachmentData.image;
            const mediaType = dataUrl.match(/data:([^;]+)/)?.[1] || 'image/png';
            
            fullParts.push({
              type: 'file',
              mediaType: mediaType,
              url: dataUrl
            });
          } catch (error) {
            console.error(`Failed to reconstruct image from S3 key ${s3Key}:`, error);
            // Keep the S3 reference if reconstruction fails
            fullParts.push(part);
          }
        } else if (part.type === 'file' && part.url?.startsWith('s3://')) {
          // Extract S3 key from s3://key format for files
          const s3Key = part.url.replace('s3://', '');
          
          try {
            console.log(`Reconstructing file from S3: ${s3Key}`);
            const attachmentData = await getAttachmentFromS3(s3Key);
            
            // Create proper file part with data
            fullParts.push({
              type: 'file',
              url: `data:${attachmentData.contentType || 'application/octet-stream'};base64,${Buffer.from(attachmentData.data || attachmentData.content || '', 'utf8').toString('base64')}`,
              mediaType: attachmentData.contentType,
              filename: attachmentData.name
            });
          } catch (error) {
            console.error(`Failed to reconstruct file from S3 key ${s3Key}:`, error);
            // Keep the S3 reference if reconstruction fails
            fullParts.push(part);
          }
        } else {
          // Keep text and other parts as-is
          fullParts.push(part);
        }
      }
      
      fullMessages.push({
        ...message,
        id: message.id || `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        parts: fullParts
      });
    }
    // Handle legacy content array format (for backward compatibility)
    else if (Array.isArray(message.content)) {
      const fullContent = [];
      
      for (const part of message.content) {
        if (part.type === 'text' && part.text?.startsWith('[Image:') && part.text?.includes('conversation context')) {
          // Find and restore image from S3 (legacy format)
          const matchingAttachment = attachmentReferences.find(ref => 
            part.text.includes(ref.originalName)
          );
          
          if (matchingAttachment) {
            const attachmentData = await getAttachmentFromS3(matchingAttachment.s3Key);
            fullContent.push(attachmentData);
          } else {
            fullContent.push(part); // Keep as-is if not found
          }
        } else {
          fullContent.push(part);
        }
      }
      
      fullMessages.push({
        ...message,
        content: fullContent
      });
    } else {
      // No parts or content array, keep message as-is
      fullMessages.push(message);
    }
  }
  
  return fullMessages;
}

/**
 * AI Streaming Jobs Worker Lambda - Universal Polling Architecture
 * 
 * Processes three types of AI streaming jobs:
 * 1. Regular Chat/Nexus Jobs: Standard AI completions using shared streaming core
 * 2. Image Generation Jobs: AI image generation with S3 storage
 * 3. Assistant Architect Jobs: Chain prompt execution with variable substitution
 * 
 * Uses shared streaming core with proper provider adapters and AI SDK v5.0+
 * for full Bedrock v1 model support and consistent behavior with nexus route.
 * 
 * Assistant Architect Jobs:
 * - Execute prompts sequentially based on position
 * - Support variable substitution between prompts using {{variable}} or {variable}
 * - Update tool_executions and prompt_results tables during execution
 * - Pass output from previous prompts as input to subsequent prompts
 * - Support repository knowledge integration via systemPrompt
 */
exports.handler = async (event) => {
  const requestId = generateRequestId();
  const timer = startTimer('lambda.handler');
  const log = createLogger({ requestId, operation: 'lambdaHandler' });
  
  log.info('StreamingJobsWorker Lambda started', {
    recordCount: event.Records?.length || 0,
    environment: process.env.ENVIRONMENT
  });

  const results = [];
  
  for (const record of event.Records) {
    try {
      // Parse SQS message body
      let sqsData;
      try {
        sqsData = JSON.parse(record.body);
      } catch (parseError) {
        // Fallback for legacy format (just jobId string)
        sqsData = { jobId: record.body };
      }
      
      const jobId = sqsData.jobId || record.body;
      const jobLog = createLogger({ requestId, jobId, operation: 'processJob' });
      jobLog.info('Processing job', {
        hasAttachments: sqsData.hasAttachments,
        attachmentCount: sqsData.attachmentCount
      });
      
      // Load job from database (lightweight version)
      const job = await loadJob(jobId);
      if (!job) {
        jobLog.error('Job not found');
        results.push({ jobId, status: 'error', error: 'Job not found' });
        continue;
      }

      // Get full messages with attachments if this job has them
      if (sqsData.hasAttachments) {
        jobLog.info('Reconstructing messages from S3', { attachmentCount: sqsData.attachmentCount });
        
        try {
          // Reconstruct full messages by retrieving attachments from S3
          const fullMessages = await reconstructMessagesWithAttachments(
            job.request_data.messages,
            sqsData.attachmentReferences || []
          );
          
          jobLog.info('Messages reconstructed successfully', {
            messageCount: fullMessages.length,
            attachmentCount: sqsData.attachmentCount
          });
          job.request_data.messages = fullMessages;
        } catch (error) {
          jobLog.error('Failed to reconstruct messages from S3', { error: error.message });
          console.warn('Proceeding with lightweight messages (attachments may be missing)');
        }
      }

      console.log(`Job loaded:`, {
        jobId,
        status: job.status,
        provider: job.request_data?.provider,
        modelId: job.request_data?.modelId,
        messageCount: job.request_data?.messages?.length || 0,
        source: job.request_data?.source,
        isImageGeneration: !!job.request_data?.options?.imageGeneration,
        isAssistantArchitect: job.request_data?.source === 'assistant-architect',
        hasToolMetadata: !!job.request_data?.toolMetadata
      });

      // Check if job is in correct state
      if (job.status !== 'pending') {
        console.warn(`Job ${jobId} not in pending state: ${job.status}`);
        results.push({ jobId, status: 'skipped', reason: 'not_pending' });
        continue;
      }

      // Mark job as running
      await updateJobStatus(jobId, 'running');
      console.log(`Job ${jobId} marked as running`);

      // Check job type and route accordingly
      const isImageGeneration = job.request_data?.options?.imageGeneration;
      const isAssistantArchitect = job.request_data?.source === 'assistant-architect';
      
      let result;
      if (isImageGeneration) {
        // Process image generation job
        result = await processImageGenerationJob(job);
      } else if (isAssistantArchitect) {
        // Process Assistant Architect chain execution job
        result = await processAssistantArchitectJob(job);
      } else {
        // Process regular streaming job using shared streaming core
        result = await processStreamingJob(job);
      }
      
      results.push({ jobId, status: 'success', result });
      console.log(`Job ${jobId} completed successfully`);

    } catch (error) {
      console.error(`Error processing job:`, error);
      
      // Extract job ID from SQS message (not the whole record.body)
      let jobId;
      try {
        const sqsData = JSON.parse(record.body);
        jobId = sqsData.jobId;
      } catch (parseError) {
        // Fallback for legacy format (just jobId string)
        jobId = record.body;
      }
      
      // Mark job as failed
      try {
        await updateJobStatus(jobId, 'failed', null, error.message);
      } catch (updateError) {
        console.error('Failed to update job status:', updateError);
      }
      
      results.push({ 
        jobId, 
        status: 'error', 
        error: 'Internal processing error' // Generic user-friendly message
      });
      
      // Log detailed error internally but don't expose to response
      console.error('Detailed error for debugging:', {
        jobId,
        error: error.message,
        stack: error.stack
      });
    }
  }

  console.log('StreamingJobsWorker completed', {
    processedJobs: results.length,
    successful: results.filter(r => r.status === 'success').length,
    failed: results.filter(r => r.status === 'error').length
  });

  return {
    statusCode: 200,
    body: JSON.stringify({
      processedJobs: results.length,
      results: results
    })
  };
};

/**
 * Load job data from database
 */
async function loadJob(jobId) {
  const command = new ExecuteStatementCommand({
    resourceArn: DATABASE_RESOURCE_ARN,
    secretArn: DATABASE_SECRET_ARN,
    database: DATABASE_NAME,
    sql: `
      SELECT 
        id,
        conversation_id,
        user_id,
        model_id,
        status,
        request_data,
        created_at
      FROM ai_streaming_jobs
      WHERE id = :job_id::uuid
    `,
    parameters: [
      { name: 'job_id', value: { stringValue: jobId } }
    ]
  });

  try {
    const response = await rdsClient.send(command);
    
    if (!response.records || response.records.length === 0) {
      return null;
    }

    const record = response.records[0];
    
    const conversationId = record[1].stringValue;
    // Determine if this is a Nexus conversation (UUID format) vs legacy (integer)
    const isUuid = conversationId && conversationId.length === 36 && conversationId.includes('-');
    
    return {
      id: record[0].stringValue,
      conversation_id: conversationId, // UUID stored as string
      nexus_conversation_id: isUuid ? conversationId : undefined, // CRITICAL: Add nexus_conversation_id field
      user_id: record[2].longValue,
      model_id: record[3].longValue,
      status: record[4].stringValue,
      request_data: JSON.parse(record[5].stringValue),
      created_at: record[6].stringValue
    };
  } catch (error) {
    console.error('Failed to load job from database:', error);
    throw error;
  }
}

/**
 * Update job status in database
 */
async function updateJobStatus(jobId, status, partialContent = null, errorMessage = null) {
  const command = new ExecuteStatementCommand({
    resourceArn: DATABASE_RESOURCE_ARN,
    secretArn: DATABASE_SECRET_ARN,
    database: DATABASE_NAME,
    sql: `
      UPDATE ai_streaming_jobs
      SET 
        status = :status::job_status,
        partial_content = :partial_content,
        error_message = :error_message,
        completed_at = CASE 
          WHEN :status IN ('completed', 'failed', 'cancelled') THEN NOW() 
          ELSE completed_at 
        END
      WHERE id = :job_id::uuid
      RETURNING id
    `,
    parameters: [
      { name: 'job_id', value: { stringValue: jobId } },
      { name: 'status', value: { stringValue: status } },
      { 
        name: 'partial_content', 
        value: partialContent ? { stringValue: partialContent } : { isNull: true } 
      },
      { 
        name: 'error_message', 
        value: errorMessage ? { stringValue: errorMessage } : { isNull: true } 
      }
    ]
  });

  try {
    const response = await rdsClient.send(command);
    const success = response.records && response.records.length > 0;
    
    if (!success) {
      throw new Error('Job status update failed - no rows updated');
    }
    
    return true;
  } catch (error) {
    console.error('Failed to update job status:', error);
    throw error;
  }
}

/**
 * Upload image to S3 and return the URL
 */
async function uploadImageToS3(jobId, imageBase64, mediaType = 'image/png') {
  if (!DOCUMENTS_BUCKET) {
    throw new Error('DOCUMENTS_BUCKET_NAME environment variable not set');
  }

  const buffer = Buffer.from(imageBase64, 'base64');
  const timestamp = Date.now();
  const extension = mediaType.split('/')[1] || 'png';
  const key = `ai-generated-images/${jobId}/${timestamp}.${extension}`;

  const command = new PutObjectCommand({
    Bucket: DOCUMENTS_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: mediaType,
    ContentLength: buffer.length,
    Metadata: {
      'job-id': jobId,
      'generated-at': new Date().toISOString(),
      'ai-generated': 'true'
    }
  });

  try {
    console.log(`Uploading image to S3: s3://${DOCUMENTS_BUCKET}/${key}`, {
      jobId,
      size: buffer.length,
      mediaType
    });

    await s3Client.send(command);
    
    // Return the S3 key (not a direct URL) for secure access via API
    console.log(`Image uploaded successfully to S3 key: ${key}`);
    return key;
    
  } catch (error) {
    console.error('Failed to upload image to S3:', error);
    throw error;
  }
}

/**
 * Save assistant response message to nexus_messages table
 */
async function saveAssistantMessage(conversationId, responseData, modelId) {
  console.log('DEBUG: saveAssistantMessage called with:', {
    conversationId,
    modelId,
    responseDataKeys: Object.keys(responseData),
    textLength: responseData.text?.length || 0,
    hasUsage: !!responseData.usage,
    finishReason: responseData.finishReason
  });

  const command = new ExecuteStatementCommand({
    resourceArn: DATABASE_RESOURCE_ARN,
    secretArn: DATABASE_SECRET_ARN,
    database: DATABASE_NAME,
    sql: `
      INSERT INTO nexus_messages (
        conversation_id, role, content, parts, 
        model_id, token_usage, finish_reason, 
        metadata, created_at
      ) VALUES (
        :conversationId::uuid, 'assistant', :content, :parts::jsonb,
        :modelId, :tokenUsage::jsonb, :finishReason,
        :metadata::jsonb, NOW()
      )
    `,
    parameters: [
      { name: 'conversationId', value: { stringValue: conversationId } },
      { name: 'content', value: { stringValue: responseData.text || '' } },
      { name: 'parts', value: { stringValue: JSON.stringify([{type: 'text', text: responseData.text || ''}]) } },
      { 
        name: 'modelId', 
        value: (modelId !== null && modelId !== undefined && Number.isFinite(modelId)) 
          ? { longValue: modelId } 
          : { isNull: true }
      },
      { name: 'tokenUsage', value: { stringValue: JSON.stringify(responseData.usage || {}) } },
      { name: 'finishReason', value: { 
        stringValue: typeof responseData.finishReason === 'string' 
          ? responseData.finishReason 
          : String(responseData.finishReason || 'stop')
      } },
      { name: 'metadata', value: { stringValue: JSON.stringify({ savedVia: 'lambda-worker' }) } }
    ]
  });

  // Debug: Ensure all values are serializable
  console.log('DEBUG: saveAssistantMessage parameters before sending:', {
    conversationId,
    modelId,
    textLength: responseData.text?.length,
    finishReasonType: typeof responseData.finishReason,
    finishReasonValue: responseData.finishReason,
    isPromise: responseData.finishReason instanceof Promise
  });
  
  console.log('DEBUG: Executing SQL command with parameters:', {
    sql: command.input.sql.replace(/\s+/g, ' ').trim(),
    parameterCount: command.input.parameters.length,
    parameters: command.input.parameters.map(p => ({
      name: p.name,
      type: p.value ? Object.keys(p.value)[0] : 'undefined',
      valueLength: p.value && typeof p.value[Object.keys(p.value)[0]] === 'string' 
        ? p.value[Object.keys(p.value)[0]].length 
        : 'N/A'
    }))
  });
  
  try {
    const result = await rdsClient.send(command);
    console.log('DEBUG: Assistant message saved successfully:', {
      conversationId,
      numberOfRecordsUpdated: result.numberOfRecordsUpdated,
      generatedFields: result.generatedFields
    });
  } catch (error) {
    console.error('DEBUG: Failed to save assistant message in Lambda:', {
      conversationId,
      error: error.message,
      errorCode: error.name,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * Update conversation message count and last_message_at timestamp
 */
async function updateConversationMessageCount(conversationId) {
  const command = new ExecuteStatementCommand({
    resourceArn: DATABASE_RESOURCE_ARN,
    secretArn: DATABASE_SECRET_ARN,
    database: DATABASE_NAME,
    sql: `
      UPDATE nexus_conversations 
      SET 
        message_count = message_count + 1,
        last_message_at = NOW(),
        updated_at = NOW()
      WHERE id = :conversationId::uuid
    `,
    parameters: [
      { name: 'conversationId', value: { stringValue: conversationId } }
    ]
  });
  
  try {
    await rdsClient.send(command);
    console.log(`Conversation message count updated for ${conversationId}`);
  } catch (error) {
    console.error('Failed to update conversation message count:', error);
    throw error;
  }
}

/**
 * Complete job with final response data
 */
async function completeJob(jobId, responseData, finalContent) {
  // Validate and prepare JSON for PostgreSQL JSONB
  let jsonString;
  try {
    jsonString = JSON.stringify(responseData);
    // Test that it can be parsed back (validates JSON structure)
    JSON.parse(jsonString);
    console.log('JSON validation passed', { 
      jsonLength: jsonString.length, 
      jsonPrefix: jsonString.substring(0, 100) 
    });
  } catch (jsonError) {
    console.error('JSON validation failed:', jsonError);
    // Use a safe fallback
    jsonString = JSON.stringify({
      text: String(responseData?.text || ''),
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      finishReason: 'unknown'
    });
  }

  const command = new ExecuteStatementCommand({
    resourceArn: DATABASE_RESOURCE_ARN,
    secretArn: DATABASE_SECRET_ARN,
    database: DATABASE_NAME,
    sql: `
      UPDATE ai_streaming_jobs 
      SET 
        status = 'completed'::job_status,
        response_data = :response_data::jsonb,
        partial_content = COALESCE(:final_content, partial_content),
        completed_at = NOW()
      WHERE id = :job_id::uuid
    `,
    parameters: [
      { name: 'job_id', value: { stringValue: jobId } },
      { name: 'response_data', value: { stringValue: jsonString } },
      { 
        name: 'final_content', 
        value: finalContent ? { stringValue: finalContent } : { isNull: true } 
      }
    ]
  });

  try {
    await rdsClient.send(command);
    console.log(`Job ${jobId} marked as completed`);
  } catch (error) {
    console.error('Failed to complete job:', error);
    throw error;
  }
}

/**
 * Process image generation job using AI SDK v5
 */
async function processImageGenerationJob(job) {
  console.log('Processing image generation job:', {
    jobId: job.id,
    provider: job.request_data.provider,
    modelId: job.request_data.modelId
  });

  try {
    const { 
      provider, 
      modelId: modelIdString,
      options = {}
    } = job.request_data;

    const imageOptions = options.imageGeneration;
    const { prompt, size = '1024x1024', style = 'natural' } = imageOptions;

    if (!prompt) {
      throw new Error('Image generation prompt is required');
    }

    // Use unified streaming service for image generation
    console.log(`Generating image with ${provider}/${modelIdString}:`, {
      prompt: prompt.substring(0, 100) + (prompt.length > 100 ? '...' : ''),
      size,
      style
    });

    const result = await unifiedStreamingService.generateImage({
      provider,
      modelId: modelIdString,
      prompt,
      size,
      style,
      userId: job.user_id.toString(),
      source: 'lambda-worker'
    });
    
    // Upload image to S3 and get S3 key
    const s3Key = await uploadImageToS3(
      job.id, 
      result.image.base64, 
      result.image.mediaType || 'image/png'
    );
    
    // Store S3 key and metadata in response_data (secure access via API)
    const responseData = {
      type: 'image',
      s3Key: s3Key,
      mediaType: result.image.mediaType || 'image/png',
      prompt,
      size,
      style,
      provider,
      model: modelIdString,
      metadata: result.metadata
    };
    
    // Complete the job with response data containing S3 URL
    await completeJob(job.id, responseData);
    
    // Save assistant response to nexus_messages (for Nexus conversations)
    if (job.request_data?.source === 'nexus' && job.nexus_conversation_id) {
      // For image generation, create a special assistant message with image metadata
      const imageResponseData = {
        text: `Generated image: ${prompt}`,
        usage: result.metadata?.usage || { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        finishReason: 'stop'
      };
      
      await saveAssistantMessage(
        job.nexus_conversation_id, 
        imageResponseData, 
        job.model_id
      );
      
      // Update conversation message count
      await updateConversationMessageCount(job.nexus_conversation_id);
    }
    
    console.log(`Image generation job ${job.id} completed successfully`, {
      imageType: result.image.mediaType,
      imageSize: result.image.base64?.length || 0,
      s3Key: s3Key,
      provider,
      model: modelIdString,
      savedToNexus: job.request_data?.source === 'nexus' && !!job.nexus_conversation_id
    });
    
    return {
      success: true,
      type: 'image_generation',
      imageGenerated: true,
      provider,
      model: modelIdString
    };

  } catch (error) {
    console.error(`Error in image generation for job ${job.id}:`, error);
    
    // Mark job as failed
    await updateJobStatus(job.id, 'failed', null, `Image generation failed: ${error.message}`);
    
    throw error;
  }
}

/**
 * Process Assistant Architect chain execution job
 */
async function processAssistantArchitectJob(job) {
  console.log('Processing Assistant Architect job:', {
    jobId: job.id,
    provider: job.request_data.provider,
    modelId: job.request_data.modelId
  });

  try {
    const {
      messages,
      modelId,
      provider,
      systemPrompt,
      options = {},
      toolMetadata,
      repositoryIds = [],
      tools = {}
    } = job.request_data;

    if (!toolMetadata) {
      throw new Error('Tool metadata is required for Assistant Architect jobs');
    }

    const { toolId, executionId, prompts, inputMapping } = toolMetadata;

    console.log('Assistant Architect job data validated:', {
      toolId,
      executionId,
      promptCount: prompts?.length || 0,
      hasInputMapping: !!inputMapping,
      repositoryCount: repositoryIds.length,
      hasTools: !!tools && Object.keys(tools).length > 0,
      toolCount: tools ? Object.keys(tools).length : 0,
      toolNames: tools ? Object.keys(tools) : []
    });

    // Update tool execution status to running
    await updateToolExecutionStatus(executionId, 'running');

    // Sort prompts by position to ensure correct execution order
    const sortedPrompts = [...prompts].sort((a, b) => a.position - b.position);
    
    console.log(`Executing ${sortedPrompts.length} chain prompts in sequence`);

    // Track context for variable substitution between prompts
    let chainContext = { ...inputMapping };

    // Execute prompts sequentially
    for (let i = 0; i < sortedPrompts.length; i++) {
      const prompt = sortedPrompts[i];
      const isLastPrompt = i === sortedPrompts.length - 1;
      
      console.log(`Executing prompt ${i + 1}/${sortedPrompts.length}: ${prompt.name}`, {
        hasEnabledTools: !!(prompt.enabledTools && prompt.enabledTools.length > 0),
        enabledTools: prompt.enabledTools || [],
        toolCount: (prompt.enabledTools || []).length
      });

      try {
        // Mark prompt as running
        await updatePromptResultStatus(executionId, prompt.id, 'running', chainContext);

        // Substitute variables in prompt content
        const processedContent = substituteVariables(prompt.content, chainContext);
        
        // Build messages for this specific prompt in UIMessage format
        const promptMessages = [
          {
            role: 'user',
            parts: [{ type: 'text', text: processedContent }]
          }
        ];

        // Simple pass-through like Nexus (which works)
        const promptTools = tools || {};
        console.log(`Prompt ${prompt.name} tools:`, {
          availableTools: Object.keys(promptTools),
          toolCount: Object.keys(promptTools).length
        });

        // Create streaming request using shared core interface
        const streamRequest = {
          messages: promptMessages,
          modelId: modelId,
          provider: provider,
          userId: job.user_id.toString(),
          sessionId: `${job.id}-prompt-${prompt.id}`,
          conversationId: job.conversation_id,
          source: 'assistant-architect',
          systemPrompt: systemPrompt + (prompt.system_context ? '\n\n' + prompt.system_context : ''),
          options: {
            reasoningEffort: options.reasoningEffort || 'medium',
            responseMode: options.responseMode || 'standard',
            maxTokens: options.maxTokens,
            temperature: options.temperature
          },
          callbacks: {
            onFinish: async ({ text, usage, finishReason, toolCalls }) => {
              console.log(`Prompt ${prompt.name} finished`, {
                hasText: !!text,
                textLength: text?.length || 0,
                finishReason,
                hasToolCalls: Array.isArray(toolCalls) && toolCalls.length > 0,
                toolCallCount: Array.isArray(toolCalls) ? toolCalls.length : 0,
                toolCallTypes: Array.isArray(toolCalls) ? toolCalls.map(tc => tc.toolName) : []
              });
            }
          },
          tools: promptTools
        };

        // Execute the prompt using unified streaming service
        const streamResponse = await unifiedStreamingService.stream(streamRequest);
        const promptResult = await streamResponse.result;

        // SANITIZED LOGGING: Log execution metadata without sensitive details
        console.log(`=== PROMPT EXECUTION COMPLETE: ${prompt.name} ===`);
        console.log('Prompt result structure:', {
          hasText: !!promptResult.text,
          textLength: promptResult.text ? promptResult.text.length : 0,
          hasToolCalls: Array.isArray(promptResult.toolCalls),
          toolCallCount: Array.isArray(promptResult.toolCalls) ? promptResult.toolCalls.length : 0,
          finishReason: promptResult.finishReason,
          usage: promptResult.usage ? {
            promptTokens: promptResult.usage.promptTokens,
            completionTokens: promptResult.usage.completionTokens,
            totalTokens: promptResult.usage.totalTokens
          } : null
        });

        // Extract final text result
        let finalText = '';
        if (promptResult.text && typeof promptResult.text.then === 'function') {
          finalText = await promptResult.text;
        } else if (typeof promptResult.text === 'string') {
          finalText = promptResult.text;
        } else {
          finalText = String(promptResult.text || '');
        }

        // Update prompt result with completion
        await updatePromptResultStatus(executionId, prompt.id, 'completed', chainContext, finalText);

        // Add prompt output to chain context for next prompts
        chainContext[`prompt_${prompt.position}_output`] = finalText;
        chainContext[`${prompt.name.toLowerCase().replace(/\s+/g, '_')}_output`] = finalText;

        console.log(`Prompt ${prompt.name} completed successfully`, {
          outputLength: finalText.length,
          contextKeys: Object.keys(chainContext).length
        });

        // For the final prompt, prepare the complete response
        if (isLastPrompt) {
          const responseData = {
            type: 'assistant_architect_chain',
            text: finalText,
            finalOutput: finalText, // Keep for backward compatibility
            chainContext: chainContext,
            totalPrompts: sortedPrompts.length,
            toolId: toolId,
            executionId: executionId,
            usage: {
              promptTokens: promptResult.usage?.promptTokens || 0,
              completionTokens: promptResult.usage?.completionTokens || 0,
              totalTokens: promptResult.usage?.totalTokens || 0
            },
            finishReason: promptResult.finishReason || 'unknown'
          };

          // Complete the streaming job
          await completeJob(job.id, responseData, finalText);

          // Check if this is a scheduled execution and trigger notification
          if (job.request_data?.scheduledExecution) {
            console.log('Triggering notification for scheduled execution', {
              executionResultId: job.request_data.scheduledExecution.executionResultId,
              scheduledExecutionId: job.request_data.scheduledExecution.scheduledExecutionId,
              scheduleName: job.request_data.scheduledExecution.scheduleName
            });

            await triggerNotification(job, responseData);
          }

          // Save assistant response to nexus_messages (for Nexus conversations)
          if (job.request_data?.source === 'nexus' && job.nexus_conversation_id) {
            const assistantResponseData = {
              text: finalText,
              usage: {
                promptTokens: promptResult.usage?.promptTokens || 0,
                completionTokens: promptResult.usage?.completionTokens || 0,
                totalTokens: promptResult.usage?.totalTokens || 0
              },
              finishReason: promptResult.finishReason || 'stop'
            };
            
            await saveAssistantMessage(
              job.nexus_conversation_id, 
              assistantResponseData, 
              job.model_id
            );
            
            // Update conversation message count
            await updateConversationMessageCount(job.nexus_conversation_id);
          }
        }

      } catch (promptError) {
        console.error(`Error executing prompt ${prompt.name}:`, promptError);
        
        // Mark prompt as failed
        await updatePromptResultStatus(executionId, prompt.id, 'failed', chainContext, null, promptError.message);
        
        throw new Error(`Prompt execution failed at step ${i + 1} (${prompt.name}): ${promptError.message}`);
      }
    }

    // Mark tool execution as completed
    await updateToolExecutionStatus(executionId, 'completed');

    console.log(`Assistant Architect job ${job.id} completed successfully`, {
      promptsExecuted: sortedPrompts.length,
      contextVariables: Object.keys(chainContext).length
    });

    return {
      success: true,
      type: 'assistant_architect',
      promptsExecuted: sortedPrompts.length,
      executionId: executionId,
      provider,
      model: modelId
    };

  } catch (error) {
    console.error(`Error in Assistant Architect processing for job ${job.id}:`, error);
    
    // Mark tool execution as failed
    if (job.request_data?.toolMetadata?.executionId) {
      await updateToolExecutionStatus(job.request_data.toolMetadata.executionId, 'failed', error.message);
    }

    // Mark job as failed
    await updateJobStatus(job.id, 'failed', null, `Assistant Architect processing failed: ${error.message}`);

    // Check if this is a scheduled execution and trigger failure notification
    if (job.request_data?.scheduledExecution) {
      console.log('Triggering failure notification for scheduled execution', {
        executionResultId: job.request_data.scheduledExecution.executionResultId,
        scheduledExecutionId: job.request_data.scheduledExecution.scheduledExecutionId,
        scheduleName: job.request_data.scheduledExecution.scheduleName,
        error: error.message
      });

      try {
        await triggerNotification(job, null, error.message);
      } catch (notificationError) {
        console.error('Failed to trigger failure notification', { error: notificationError.message });
      }
    }

    throw error;
  }
}

/**
 * Process streaming job using shared streaming core
 */
async function processStreamingJob(job) {
  console.log('Processing streaming job with shared core:', {
    jobId: job.id,
    provider: job.request_data.provider,
    modelId: job.request_data.modelId
  });

  try {
    // Extract request data (messages extracted after potential S3 reconstruction)
    const { 
      modelId, 
      provider, 
      systemPrompt, 
      options = {},
      tools = {}
    } = job.request_data;
    
    // Get messages after reconstruction (if any) has occurred
    const messages = job.request_data.messages;
    
    // Keep messages in UIMessage format (parts arrays) - let convertToModelMessages handle the conversion

    // Validate messages
    if (!messages || !Array.isArray(messages)) {
      throw new Error(`Invalid messages in job data: ${typeof messages}`);
    }

    console.log('Job data validated:', {
      messageCount: messages.length,
      provider,
      modelId,
      hasSystemPrompt: !!systemPrompt,
      hasTools: Object.keys(tools).length > 0
    });
    
    // DEBUG: Comprehensive message format logging for debugging circular conversion issue
    console.log('=== MESSAGE FORMAT DEBUG BEFORE STREAMING SERVICE ===');
    messages.forEach((msg, idx) => {
      try {
        // Only log messages that might have images
        const hasImageParts = msg.parts && Array.isArray(msg.parts) && msg.parts.some(p => p.type === 'image');
        const hasImageContent = msg.content && Array.isArray(msg.content) && msg.content.some(p => p.type === 'image');

        if (hasImageParts || hasImageContent) {
          console.log(`Message ${idx} (${msg.role}) format analysis:`, {
            hasContent: !!msg.content,
            hasParts: !!msg.parts,
            contentType: Array.isArray(msg.content) ? 'array' : typeof msg.content,
            partsType: Array.isArray(msg.parts) ? 'array' : typeof msg.parts,
            contentLength: Array.isArray(msg.content) ? msg.content.length : 0,
            partsLength: Array.isArray(msg.parts) ? msg.parts.length : 0,
            imageInParts: Array.isArray(msg.parts) ? msg.parts.filter(p => p.type === 'image').map(p => ({
              hasImage: !!p.image,
              imageStartsWithData: p.image?.startsWith('data:'),
              imageLength: p.image?.length || 0
            })) : [],
            imageInContent: Array.isArray(msg.content) ? msg.content.filter(p => p.type === 'image').map(p => ({
              hasImage: !!p.image,
              imageStartsWithData: p.image?.startsWith('data:'),
              imageLength: p.image?.length || 0
            })) : []
          });
        }
      } catch (error) {
        console.log(`Debug logging error for message ${idx}:`, {
          error: error.message,
          messageStructure: {
            role: msg.role,
            hasContent: !!msg.content,
            hasParts: !!msg.parts,
            contentType: typeof msg.content,
            partsType: typeof msg.parts
          }
        });
      }
    });
    
    // Create streaming request using shared core interface
    const streamRequest = {
      messages: messages,
      modelId: modelId,
      provider: provider,
      userId: job.user_id.toString(),
      sessionId: job.id, // Use job ID as session
      conversationId: job.conversation_id,
      source: 'lambda-worker',
      systemPrompt: systemPrompt,
      tools: tools,
      options: {
        reasoningEffort: options.reasoningEffort || 'medium',
        responseMode: options.responseMode || 'standard',
        maxTokens: options.maxTokens,
        temperature: options.temperature
      },
      callbacks: {
        onFinish: async ({ text, usage, finishReason }) => {
          console.log('Shared streaming core finished', {
            hasText: !!text,
            textLength: text?.length || 0,
            hasUsage: !!usage,
            finishReason
          });
        }
      }
    };
    
    // Stream using shared streaming core
    const streamResponse = await unifiedStreamingService.stream(streamRequest);
    
    // Wait for final result
    const finalResult = await streamResponse.result;
    
    // Handle tool calls if present
    if (finalResult.toolCalls && finalResult.toolCalls.length > 0) {
      console.log(`Job ${job.id} executed ${finalResult.toolCalls.length} tool calls`);
    }
    
    // Prepare final response data
    let finalText = '';
    if (finalResult.text && typeof finalResult.text.then === 'function') {
      // It's a Promise, await it
      finalText = await finalResult.text;
    } else if (typeof finalResult.text === 'string') {
      // It's already a string
      finalText = finalResult.text;
    } else {
      // Fallback
      finalText = String(finalResult.text || '');
    }
    
    const responseData = {
      text: finalText,
      usage: {
        promptTokens: finalResult.usage?.promptTokens || 0,
        completionTokens: finalResult.usage?.completionTokens || 0,
        totalTokens: finalResult.usage?.totalTokens || 0,
        // Only include reasoningTokens if it's actually defined
        ...(finalResult.experimental_providerMetadata?.openai?.reasoningTokens && {
          reasoningTokens: finalResult.experimental_providerMetadata.openai.reasoningTokens
        })
      },
      finishReason: (await Promise.resolve(finalResult.finishReason)) || 'unknown'
    };

    // Complete the job
    console.log('About to complete job with responseData:', {
      responseDataKeys: Object.keys(responseData),
      finalTextLength: finalText.length,
      tokensUsed: responseData.usage.totalTokens
    });
    
    await completeJob(job.id, responseData, responseData.text);
    
    // Save assistant response to nexus_messages (for Nexus conversations)
    console.log('DEBUG: Checking if should save assistant message', {
      jobId: job.id,
      hasRequestData: !!job.request_data,
      source: job.request_data?.source,
      isNexusSource: job.request_data?.source === 'nexus',
      conversationId: job.conversation_id,
      nexusConversationId: job.nexus_conversation_id,
      hasNexusConversationId: !!job.nexus_conversation_id,
      modelId: job.model_id,
      allJobFields: Object.keys(job)
    });
    
    if (job.request_data.source === 'nexus' && job.nexus_conversation_id) {
      console.log('DEBUG: Attempting to save assistant message', {
        conversationId: job.nexus_conversation_id,
        modelId: job.model_id,
        responseDataKeys: Object.keys(responseData),
        textLength: responseData.text?.length || 0
      });
      
      try {
        await saveAssistantMessage(
          job.nexus_conversation_id, 
          responseData, 
          job.model_id
        );
        
        console.log('DEBUG: Assistant message saved successfully');
        
        // Update conversation message count
        await updateConversationMessageCount(job.nexus_conversation_id);
        
        console.log('DEBUG: Conversation message count updated');
      } catch (saveError) {
        console.error('DEBUG: Failed to save assistant message in Lambda worker', {
          jobId: job.id,
          conversationId: job.nexus_conversation_id,
          error: saveError.message,
          stack: saveError.stack
        });
        // Don't throw - let job complete but log the failure
      }
    } else {
      console.log('DEBUG: Skipping assistant message save - conditions not met', {
        isNexusSource: job.request_data?.source === 'nexus',
        hasConversationId: !!job.nexus_conversation_id
      });
    }
    
    console.log(`Job ${job.id} processing completed successfully`, {
      textLength: responseData.text.length,
      tokenCount: responseData.usage.totalTokens,
      finishReason: finalResult.finishReason,
      savedToNexus: job.request_data.source === 'nexus' && !!job.nexusConversationId
    });
    
    return {
      success: true,
      responseLength: responseData.text.length,
      tokensUsed: responseData.usage.totalTokens,
      finishReason: finalResult.finishReason
    };

  } catch (error) {
    console.error(`Error in AI processing for job ${job.id}:`, error);
    
    // Mark job as failed
    await updateJobStatus(job.id, 'failed', null, `AI processing failed: ${error.message}`);
    
    throw error;
  }
}

/**
 * Update tool execution status in database
 */
async function updateToolExecutionStatus(executionId, status, errorMessage = null) {
  const command = new ExecuteStatementCommand({
    resourceArn: DATABASE_RESOURCE_ARN,
    secretArn: DATABASE_SECRET_ARN,
    database: DATABASE_NAME,
    sql: `
      UPDATE tool_executions
      SET 
        status = :status::execution_status,
        error_message = :error_message,
        completed_at = CASE 
          WHEN :status IN ('completed', 'failed') THEN NOW() 
          ELSE completed_at 
        END
      WHERE id = :execution_id
      RETURNING id
    `,
    parameters: [
      { name: 'execution_id', value: { longValue: parseInt(executionId) } },
      { name: 'status', value: { stringValue: status } },
      { 
        name: 'error_message', 
        value: errorMessage ? { stringValue: errorMessage } : { isNull: true } 
      }
    ]
  });

  try {
    const response = await rdsClient.send(command);
    const success = response.records && response.records.length > 0;
    
    if (!success) {
      throw new Error('Tool execution status update failed - no rows updated');
    }
    
    console.log(`Tool execution ${executionId} status updated to: ${status}`);
    return true;
  } catch (error) {
    console.error('Failed to update tool execution status:', error);
    throw error;
  }
}

/**
 * Update prompt result status in database
 */
async function updatePromptResultStatus(executionId, promptId, status, inputData = {}, outputData = null, errorMessage = null) {
  // First, check if a prompt result already exists
  const existsCommand = new ExecuteStatementCommand({
    resourceArn: DATABASE_RESOURCE_ARN,
    secretArn: DATABASE_SECRET_ARN,
    database: DATABASE_NAME,
    sql: `
      SELECT id FROM prompt_results 
      WHERE execution_id = :execution_id AND prompt_id = :prompt_id
      LIMIT 1
    `,
    parameters: [
      { name: 'execution_id', value: { longValue: parseInt(executionId) } },
      { name: 'prompt_id', value: { longValue: parseInt(promptId) } }
    ]
  });

  try {
    const existsResponse = await rdsClient.send(existsCommand);
    const recordExists = existsResponse.records && existsResponse.records.length > 0;

    let command;
    if (recordExists) {
      // Update existing record
      command = new ExecuteStatementCommand({
        resourceArn: DATABASE_RESOURCE_ARN,
        secretArn: DATABASE_SECRET_ARN,
        database: DATABASE_NAME,
        sql: `
          UPDATE prompt_results
          SET 
            status = :status::execution_status,
            output_data = :output_data,
            error_message = :error_message,
            completed_at = CASE 
              WHEN :status IN ('completed', 'failed') THEN NOW() 
              ELSE completed_at 
            END
          WHERE execution_id = :execution_id AND prompt_id = :prompt_id
          RETURNING id
        `,
        parameters: [
          { name: 'execution_id', value: { longValue: parseInt(executionId) } },
          { name: 'prompt_id', value: { longValue: parseInt(promptId) } },
          { name: 'status', value: { stringValue: status } },
          { 
            name: 'output_data', 
            value: outputData ? { stringValue: outputData } : { isNull: true } 
          },
          { 
            name: 'error_message', 
            value: errorMessage ? { stringValue: errorMessage } : { isNull: true } 
          }
        ]
      });
    } else {
      // Insert new record
      command = new ExecuteStatementCommand({
        resourceArn: DATABASE_RESOURCE_ARN,
        secretArn: DATABASE_SECRET_ARN,
        database: DATABASE_NAME,
        sql: `
          INSERT INTO prompt_results (
            execution_id, 
            prompt_id, 
            input_data, 
            status, 
            output_data, 
            error_message,
            started_at
          ) VALUES (
            :execution_id, 
            :prompt_id, 
            :input_data::jsonb, 
            :status::execution_status,
            :output_data,
            :error_message,
            NOW()
          )
          RETURNING id
        `,
        parameters: [
          { name: 'execution_id', value: { longValue: parseInt(executionId) } },
          { name: 'prompt_id', value: { longValue: parseInt(promptId) } },
          { name: 'input_data', value: { stringValue: JSON.stringify(inputData) } },
          { name: 'status', value: { stringValue: status } },
          { 
            name: 'output_data', 
            value: outputData ? { stringValue: outputData } : { isNull: true } 
          },
          { 
            name: 'error_message', 
            value: errorMessage ? { stringValue: errorMessage } : { isNull: true } 
          }
        ]
      });
    }

    const response = await rdsClient.send(command);
    const success = response.records && response.records.length > 0;
    
    if (!success) {
      throw new Error('Prompt result status update failed - no rows updated');
    }
    
    console.log(`Prompt result for execution ${executionId}, prompt ${promptId} ${recordExists ? 'updated' : 'created'} with status: ${status}`);
    return true;

  } catch (error) {
    console.error('Failed to update prompt result status:', error);
    throw error;
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
      console.warn(`Invalid variable name: ${key}, skipping`);
      continue;
    }
    
    // Security: Prevent excessively long variable names (potential DoS)
    if (key.length > 100) {
      console.warn(`Variable name too long: ${key}, skipping`);
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
        console.warn(`Failed to serialize variable ${key}:`, error.message);
        validatedContext[key] = String(value);
      }
    }
  }
  
  // Replace variables with double braces: {{variable}}
  processedContent = processedContent.replace(/\{\{([^}]+)\}\}/g, (match, variableName) => {
    const trimmedName = variableName.trim();
    
    // Validate variable name format
    if (!/^[a-zA-Z0-9_-]+$/.test(trimmedName)) {
      console.warn(`Invalid variable name format: ${trimmedName}, leaving as-is`);
      return match;
    }
    
    if (validatedContext.hasOwnProperty(trimmedName)) {
      return validatedContext[trimmedName];
    }
    console.warn(`Variable ${trimmedName} not found in context, leaving as-is`);
    return match; // Leave as-is if variable not found
  });
  
  // Replace variables with single braces: {variable}
  processedContent = processedContent.replace(/\{([^}]+)\}/g, (match, variableName) => {
    const trimmedName = variableName.trim();
    
    // Validate variable name format
    if (!/^[a-zA-Z0-9_-]+$/.test(trimmedName)) {
      console.warn(`Invalid variable name format: ${trimmedName}, leaving as-is`);
      return match;
    }
    
    if (validatedContext.hasOwnProperty(trimmedName)) {
      return validatedContext[trimmedName];
    }
    console.warn(`Variable ${trimmedName} not found in context, leaving as-is`);
    return match; // Leave as-is if variable not found
  });
  
  return processedContent;
}

/**
 * Trigger notification for scheduled execution completion
 */
async function triggerNotification(job, responseData, errorMessage = null) {
  try {
    const scheduledExecution = job.request_data.scheduledExecution;

    console.log('Processing notification trigger', {
      executionResultId: scheduledExecution.executionResultId,
      scheduledExecutionId: scheduledExecution.scheduledExecutionId,
      hasError: !!errorMessage
    });

    // Update execution result with completion data
    await updateExecutionResult(
      scheduledExecution.executionResultId,
      errorMessage ? 'failed' : 'success',
      responseData,
      null, // execution duration will be calculated by database
      errorMessage
    );

    // Get notification queue URL from SSM
    const notificationQueueUrl = await getNotificationQueueUrl();
    if (!notificationQueueUrl) {
      console.warn('Notification queue URL not found, skipping notification');
      return;
    }

    // Send notification message to queue
    const notificationMessage = {
      executionResultId: scheduledExecution.executionResultId,
      userId: scheduledExecution.userId,
      notificationType: 'email',
      scheduleName: scheduledExecution.scheduleName
    };

    await sqsClient.send(new SendMessageCommand({
      QueueUrl: notificationQueueUrl,
      MessageBody: JSON.stringify(notificationMessage),
      MessageAttributes: {
        notificationType: {
          DataType: 'String',
          StringValue: 'email'
        },
        executionResultId: {
          DataType: 'String',
          StringValue: String(scheduledExecution.executionResultId)
        },
        userId: {
          DataType: 'String',
          StringValue: String(scheduledExecution.userId)
        }
      }
    }));

    console.log('Notification triggered successfully', {
      executionResultId: scheduledExecution.executionResultId,
      notificationQueueUrl: notificationQueueUrl.replace(/\/([^\/]+)$/, '/***')
    });

  } catch (error) {
    console.error('Failed to trigger notification', {
      error: error.message,
      jobId: job.id,
      executionResultId: job.request_data?.scheduledExecution?.executionResultId
    });
    // Don't throw error - notification failure shouldn't fail the job
  }
}

/**
 * Update execution result in database
 */
async function updateExecutionResult(executionResultId, status, resultData, executionDuration, errorMessage) {
  const command = new ExecuteStatementCommand({
    resourceArn: DATABASE_RESOURCE_ARN,
    secretArn: DATABASE_SECRET_ARN,
    database: DATABASE_NAME,
    sql: `
      UPDATE execution_results
      SET
        status = :status,
        result_data = :result_data::jsonb,
        execution_duration_ms = COALESCE(:execution_duration_ms, EXTRACT(EPOCH FROM (NOW() - executed_at)) * 1000),
        error_message = :error_message
      WHERE id = :execution_result_id
      RETURNING id
    `,
    parameters: [
      { name: 'execution_result_id', value: { longValue: executionResultId } },
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

  await rdsClient.send(command);
  console.log('Execution result updated', { executionResultId, status });
}

/**
 * Get notification queue URL from SSM Parameter Store
 */
async function getNotificationQueueUrl() {
  try {
    const parameterName = `/aistudio/${process.env.ENVIRONMENT || 'dev'}/notification-queue-url`;

    const command = new GetParameterCommand({
      Name: parameterName
    });

    const response = await ssmClient.send(command);
    return response.Parameter?.Value;
  } catch (error) {
    console.error('Failed to get notification queue URL from SSM', {
      error: error.message,
      parameterName: `/aistudio/${process.env.ENVIRONMENT || 'dev'}/notification-queue-url`
    });
    return null;
  }
}