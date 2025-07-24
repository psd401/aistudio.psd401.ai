import { NextRequest, NextResponse } from 'next/server'
import { generateCompletion } from '@/lib/ai-helpers'
import { getServerSession } from '@/lib/auth/server-session'
import { executeSQL } from '@/lib/db/data-api-adapter'
import { getCurrentUserAction } from '@/actions/db/get-current-user-action'
import logger from "@/lib/logger"
import { getErrorMessage } from "@/types/errors"

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
  logger.info('[PDF-to-Markdown] Request received');
  
  // Set response headers early to ensure proper content type
  const headers = {
    'Content-Type': 'application/json',
  };
  
  // Get user authentication
  const session = await getServerSession();
  if (!session || !session.sub) {
    return new NextResponse(
      JSON.stringify({ error: 'Unauthorized' }), 
      { status: 401, headers }
    );
  }
  
  // Get the current user's database ID
  const currentUser = await getCurrentUserAction();
  if (!currentUser.isSuccess || !currentUser.data) {
    return new NextResponse(
      JSON.stringify({ error: 'User not found' }), 
      { status: 401, headers }
    );
  }
  
  try {
    // Parse multipart form data
    logger.info('[PDF-to-Markdown] Parsing form data...');
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) {
      logger.info('[PDF-to-Markdown] No file provided');
      return new NextResponse(
        JSON.stringify({ error: 'No file uploaded.' }), 
        { status: 400, headers }
      );
    }
    
    logger.info(`[PDF-to-Markdown] File received: ${file.name}, size: ${file.size} bytes, type: ${file.type}`);
    
    if (file.type !== 'application/pdf') {
      logger.info('[PDF-to-Markdown] Invalid file type:', file.type);
      return new NextResponse(
        JSON.stringify({ error: 'Only PDF files are supported.' }), 
        { status: 400, headers }
      );
    }
    if (file.size > 25 * 1024 * 1024) {
      logger.info('[PDF-to-Markdown] File too large:', file.size);
      return new NextResponse(
        JSON.stringify({ error: 'File size exceeds 25MB limit.' }), 
        { status: 400, headers }
      );
    }

    // Convert file to base64 for storage
    logger.info('[PDF-to-Markdown] Converting file to base64...');
    const arrayBuffer = await file.arrayBuffer()
    const base64Data = Buffer.from(arrayBuffer).toString('base64')
    
    // Create a job in the database
    logger.info('[PDF-to-Markdown] Creating job in database...');
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
    
    logger.info(`[PDF-to-Markdown] Job created with ID: ${job.id}`);
    
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
      logger.error(`[PDF-to-Markdown] Job not visible after insert: ${job.id}`);
      return new NextResponse(
        JSON.stringify({ error: 'Job not committed to database. Please try again.' }),
        { status: 500, headers }
      );
    }
    
    // Start processing in the background (non-blocking)
    processPdfInBackground(job.id as number, jobInput).catch(error => {
      logger.error('[PDF-to-Markdown] Background processing error:', error);
    });
    
    // Small delay to ensure background process starts
    await new Promise(resolve => setTimeout(resolve, 100));
    
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
    logger.error('[PDF-to-Markdown] General error:', error);
    logger.error('[PDF-to-Markdown] Error stack:', error);
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
  try {
    logger.info(`[PDF-to-Markdown Background] Starting processing for job ${jobId}`);
    
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
      throw new Error('AI model not found');
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
    
    logger.info(`[PDF-to-Markdown Background] Prepared messages for job ${jobId}:`, {
      role: messages[0].role,
      contentTypes: messages[0].content.map(c => c.type),
      textLength: (messages[0].content[0] as { type: string; text: string })?.text?.length || 0,
      fileSize: (messages[0].content[1] as { type: string; data: Buffer })?.data?.length || 0
    });
    
    // Call the LLM
    logger.info(`[PDF-to-Markdown Background] Calling LLM for job ${jobId}...`);
    const startTime = Date.now();
    const markdown = await generateCompletion(
      { provider: model.provider as string, modelId: model.model_id as string },
      messages
    );
    
    const processingTime = Date.now() - startTime;
    logger.info(`[PDF-to-Markdown Background] Job ${jobId} completed in ${processingTime}ms`);
    logger.info(`[PDF-to-Markdown Background] Markdown result length: ${markdown?.length || 0}`);
    
    if (!markdown) {
      throw new Error('No markdown content generated');
    }
    
    // Update job with result
    const outputData = { 
      markdown,
      fileName: jobInput.fileName,
      processingTime 
    };
    
    logger.info(`[PDF-to-Markdown Background] Saving result for job ${jobId}:`, {
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
    
    logger.info(`[PDF-to-Markdown Background] Job ${jobId} successfully saved to database`);
      
  } catch (error) {
    logger.error(`[PDF-to-Markdown Background] Job ${jobId} failed:`, error);
    logger.error(`[PDF-to-Markdown Background] Error details:`, error);
    
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