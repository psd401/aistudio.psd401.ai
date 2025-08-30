import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth/server-session';
import { confirmDocumentUpload, getJobStatus } from '@/lib/services/document-job-service';
import { sendToProcessingQueue } from '@/lib/aws/lambda-trigger';
import { createLogger, generateRequestId, startTimer } from '@/lib/logger';
import { z } from 'zod';

const ConfirmUploadSchema = z.object({
  uploadId: z.string().min(1),
  jobId: z.string().uuid(),
});

export async function POST(req: NextRequest) {
  const requestId = generateRequestId();
  const timer = startTimer('api.documents.v2.confirm-upload');
  const log = createLogger({ requestId, route: 'api.documents.v2.confirm-upload' });
  
  try {
    const session = await getServerSession();
    if (!session?.userId) {
      log.warn('Unauthorized request');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const body = await req.json();
    const { uploadId, jobId } = ConfirmUploadSchema.parse(body);
    
    log.info('Confirming upload', { uploadId, jobId, userId: session.userId });
    
    // Get job details to verify ownership and get processing info
    const job = await getJobStatus(jobId, session.userId);
    if (!job) {
      log.warn('Job not found for confirmation', { jobId, userId: session.userId });
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }
    
    // Confirm upload in job tracking
    await confirmDocumentUpload(jobId, uploadId);
    
    // Generate S3 key based on job ID and filename
    const s3Key = `uploads/${jobId}/${job.fileName.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
    
    // Send processing job to SQS queue
    await sendToProcessingQueue({
      jobId,
      bucket: process.env.DOCUMENTS_BUCKET_NAME || 'aistudio-documents-dev',
      key: s3Key,
      fileName: job.fileName,
      fileSize: job.fileSize,
      fileType: job.fileType,
      userId: session.userId,
      processingOptions: job.processingOptions,
    });
    
    log.info('Upload confirmed and processing queued', { jobId, uploadId });
    timer({ status: 'success' });
    
    return NextResponse.json({ 
      success: true,
      jobId,
      status: 'processing',
      message: 'Upload confirmed and processing started'
    });
    
  } catch (error) {
    log.error('Failed to confirm upload', error);
    timer({ status: 'error' });
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { 
          error: 'Invalid request data',
          details: error.errors.map(e => `${e.path.join('.')}: ${e.message}`)
        },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { error: 'Failed to confirm upload' },
      { status: 500 }
    );
  }
}