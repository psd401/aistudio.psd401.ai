import { NextRequest, NextResponse } from 'next/server'
import { generateCompletion } from '@/lib/ai-helpers'
import { getServerSession } from '@/lib/auth/server-session'
import { executeSQL } from '@/lib/db/data-api-adapter'
import { getCurrentUserAction } from '@/actions/db/get-current-user-action'
import { createLogger, generateRequestId, startTimer } from "@/lib/logger"
import { getErrorMessage } from "@/types/errors"
import { ErrorFactories } from "@/lib/error-utils"

// Easily change the model id here
const PDF_TO_MARKDOWN_MODEL_ID = 20

// Limit request body size to 25MB for uploads
export const config = {
  api: {
    bodyParser: {
      sizeLimit: "25mb"
    }
  }
}

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const requestId = generateRequestId();
  const timer = startTimer("api.assistant-architect.pdf-to-markdown");
  const log = createLogger({ requestId, route: "api.assistant-architect.pdf-to-markdown" });
  
  log.info('POST /api/assistant-architect/pdf-to-markdown - Processing PDF conversion');
  
  // Set response headers early to ensure proper content type
  const headers = {
    'Content-Type': 'application/json',
    'X-Request-Id': requestId,
  };
  
  // Get user authentication
  const session = await getServerSession();
  if (!session || !session.sub) {
    log.warn("Unauthorized - No session");
    timer({ status: "error", reason: "unauthorized" });
    return new NextResponse(
      JSON.stringify({ error: 'Unauthorized' }), 
      { status: 401, headers }
    );
  }
  
  // Get the current user's database ID
  const currentUser = await getCurrentUserAction();
  if (!currentUser.isSuccess || !currentUser.data) {
    log.warn("User not found");
    timer({ status: "error", reason: "user_not_found" });
    return new NextResponse(
      JSON.stringify({ error: 'User not found' }), 
      { status: 401, headers }
    );
  }
  
  try {
    // Parse multipart form data
    log.debug('Parsing form data');
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) {
      log.warn('No file provided');
      timer({ status: "error", reason: "no_file" });
      return new NextResponse(
        JSON.stringify({ error: 'No file uploaded.' }), 
        { status: 400, headers }
      );
    }
    
    log.debug('File received', { fileName: file.name, size: file.size, type: file.type });
    
    if (file.type !== 'application/pdf') {
      log.warn('Invalid file type', { fileType: file.type });
      timer({ status: "error", reason: "invalid_file_type" });
      return new NextResponse(
        JSON.stringify({ error: 'Only PDF files are supported.' }), 
        { status: 400, headers }
      );
    }
    if (file.size > 25 * 1024 * 1024) {
      log.warn('File too large', { fileSize: file.size });
      timer({ status: "error", reason: "file_too_large" });
      return new NextResponse(
        JSON.stringify({ error: 'File size exceeds 25MB limit.' }), 
        { status: 400, headers }
      );
    }

    // Convert file to base64 for storage
    log.debug('Converting file to base64');
    const arrayBuffer = await file.arrayBuffer()
    const base64Data = Buffer.from(arrayBuffer).toString('base64')
    
    // Create a job in the database
    log.debug('Creating job in database');
    const jobInput = {
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
      fileData: base64Data,
      modelId: PDF_TO_MARKDOWN_MODEL_ID
    };
    
    const jobResult = await executeSQL(`
      INSERT INTO jobs (user_id, type, status, input, created_at, updated_at)
      VALUES (:userId, 'pdf-to-markdown', 'pending'::job_status, :input, NOW(), NOW())
      RETURNING id, user_id, type, status, input, output, error, created_at, updated_at
    `, [
      { name: 'userId', value: { longValue: currentUser.data.user.id } },
      { name: 'input', value: { stringValue: JSON.stringify(jobInput) } }
    ]);
    
    const job = jobResult[0];
    
    log.info('Job created', { jobId: job.id });
    
    // Ensure job is committed and visible before returning
    let committedJob = null;
    for (let i = 0; i < 5; i++) {
      const foundJobs = await executeSQL(`
        SELECT id, user_id, type, status, input, output, error, created_at, updated_at
        FROM jobs
        WHERE id = :jobId
      `, [{ name: 'jobId', value: { longValue: job.id as number } }]);
      
      if (foundJobs && foundJobs.length > 0) {
        committedJob = foundJobs[0];
        break;
      }
      await new Promise(res => setTimeout(res, 100)); // wait 100ms
    }
    if (!committedJob) {
      log.error('Job not visible after insert', { jobId: job.id });
      timer({ status: "error", reason: "job_not_committed" });
      return new NextResponse(
        JSON.stringify({ error: 'Job not committed to database. Please try again.' }),
        { status: 500, headers }
      );
    }
    
    // Start processing in the background (non-blocking)
    processPdfInBackground(job.id as number, jobInput).catch(error => {
      const bgLog = createLogger({ requestId: `job-${job.id}`, route: "api.assistant-architect.pdf-to-markdown" });
      bgLog.error('Background processing error', error);
    });
    
    // Small delay to ensure background process starts
    await new Promise(resolve => setTimeout(resolve, 100));
    
    log.info('PDF processing started', { jobId: job.id });
    timer({ status: "success", jobId: job.id });
    
    // Return immediately with job ID
    return new NextResponse(
      JSON.stringify({ 
        jobId: job.id as number,
        status: 'processing',
        message: 'PDF processing started. Poll for status updates.'
      }), 
      { status: 202, headers }
    );
    
  } catch (error) {
    timer({ status: "error" });
    log.error('Failed to process PDF file', error);
    return new NextResponse(
      JSON.stringify({ error: 'Failed to process PDF file' }), 
      { status: 500, headers }
    );
  }
}

// Background processing function
interface JobInput {
  fileName: string;
  fileSize: number;
  fileType: string;
  fileData: string;
  modelId: number;
}

async function processPdfInBackground(jobId: number, jobInput: JobInput) {
  const log = createLogger({ requestId: `job-${jobId}`, route: "api.assistant-architect.pdf-background" });
  
  try {
    log.info('Starting background processing', { jobId });
    
    // Update job status to running
    await executeSQL(`
      UPDATE jobs
      SET status = 'running'::job_status, updated_at = NOW()
      WHERE id = :jobId
    `, [{ name: 'jobId', value: { longValue: jobId } }]);
    
    // Get model config from DB
    const modelResult = await executeSQL(`
      SELECT id, name, provider, model_id, description, capabilities, max_tokens, active, chat_enabled
      FROM ai_models
      WHERE id = :modelId
    `, [{ name: 'modelId', value: { longValue: jobInput.modelId } }]);
    
    const model = modelResult && modelResult.length > 0 ? modelResult[0] : null;
    
    if (!model) {
      throw ErrorFactories.dbRecordNotFound('ai_models', jobInput.modelId);
    }
    
    // Convert base64 back to buffer
    const pdfBuffer = Buffer.from(jobInput.fileData, 'base64');
    
    // System prompt for the LLM
    const systemPrompt = `You are an expert document parser. Given a PDF file, extract ALL text and describe every image or graphic in context. Return a single, well-structured markdown document that preserves the logical order and hierarchy of the original. For images/graphics, insert a markdown image block with a description, e.g. ![Description of image]. Do not skip any content. Output only markdown.`
    
    // Prepare messages for the LLM
    const messages = [
      {
        role: 'user' as const,
        content: [
          { type: 'text' as const, text: systemPrompt },
          { type: 'file' as const, data: pdfBuffer, mimeType: 'application/pdf' }
        ]
      }
    ];
    
    log.info(`[PDF-to-Markdown Background] Prepared messages for job ${jobId}:`, {
      role: messages[0].role,
      contentTypes: messages[0].content.map(c => c.type),
      textLength: (messages[0].content[0] as { type: string; text: string })?.text?.length || 0,
      fileSize: (messages[0].content[1] as { type: string; data: Buffer })?.data?.length || 0
    });
    
    // Call the LLM
    log.info(`[PDF-to-Markdown Background] Calling LLM for job ${jobId}...`);
    const startTime = Date.now();
    const markdown = await generateCompletion(
      { provider: model.provider as string, modelId: model.modelId as string },
      messages
    );
    
    const processingTime = Date.now() - startTime;
    log.info(`[PDF-to-Markdown Background] Job ${jobId} completed in ${processingTime}ms`);
    log.info(`[PDF-to-Markdown Background] Markdown result length: ${markdown?.length || 0}`);
    
    if (!markdown) {
      throw ErrorFactories.externalServiceError('AI Model', new Error('No markdown content generated'));
    }
    
    // Update job with result
    const outputData = { 
      markdown,
      fileName: jobInput.fileName,
      processingTime 
    };
    
    log.info(`[PDF-to-Markdown Background] Saving result for job ${jobId}:`, {
      markdownLength: markdown.length,
      fileName: jobInput.fileName
    });
    
    await executeSQL(`
      UPDATE jobs
      SET status = 'completed'::job_status, output = :output, updated_at = NOW()
      WHERE id = :jobId
    `, [
      { name: 'output', value: { stringValue: JSON.stringify(outputData) } },
      { name: 'jobId', value: { longValue: jobId } }
    ]);
    
    log.info(`[PDF-to-Markdown Background] Job ${jobId} successfully saved to database`);
      
  } catch (error) {
    log.error(`[PDF-to-Markdown Background] Job ${jobId} failed:`, error);
    log.error(`[PDF-to-Markdown Background] Error details:`, error);
    
    // Update job with error
    await executeSQL(`
      UPDATE jobs
      SET status = 'failed'::job_status, error = :error, updated_at = NOW()
      WHERE id = :jobId
    `, [
      { name: 'error', value: { stringValue: getErrorMessage(error) || 'Unknown error' } },
      { name: 'jobId', value: { longValue: jobId } }
    ]);
  }
}