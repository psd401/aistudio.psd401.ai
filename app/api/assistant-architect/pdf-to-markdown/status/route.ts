import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db/db'
import { jobsTable } from '@/db/schema/jobs-schema'
import { eq, and } from 'drizzle-orm'
import { getAuth } from '@clerk/nextjs/server'

export async function GET(req: NextRequest) {
  const headers = {
    'Content-Type': 'application/json',
  };
  
  // Get user authentication
  const { userId } = getAuth(req);
  if (!userId) {
    return new NextResponse(
      JSON.stringify({ error: 'Unauthorized' }), 
      { status: 401, headers }
    );
  }
  
  // Get job ID from query params
  const { searchParams } = new URL(req.url);
  const jobId = searchParams.get('jobId');
  
  if (!jobId) {
    return new NextResponse(
      JSON.stringify({ error: 'Job ID is required' }), 
      { status: 400, headers }
    );
  }
  
  try {
    // Fetch job from database
    const [job] = await db
      .select()
      .from(jobsTable)
      .where(and(
        eq(jobsTable.id, jobId),
        eq(jobsTable.userId, userId)
      ));
    
    if (!job) {
      return new NextResponse(
        JSON.stringify({ error: 'Job not found' }), 
        { status: 404, headers }
      );
    }
    
    // Parse output if job is completed
    let result: any = {
      jobId: job.id,
      status: job.status,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt
    };
    
    if (job.status === 'completed' && job.output) {
      console.log('[PDF Status Check] Job completed, parsing output...');
      try {
        const output = JSON.parse(job.output);
        console.log('[PDF Status Check] Parsed output:', { 
          hasMarkdown: !!output.markdown, 
          markdownLength: output.markdown?.length,
          fileName: output.fileName 
        });
        
        result = {
          ...result,
          markdown: output.markdown,
          fileName: output.fileName,
          processingTime: output.processingTime
        };
      } catch (parseError) {
        console.error('[PDF Status Check] Failed to parse job output:', parseError);
        return new NextResponse(
          JSON.stringify({ error: 'Failed to parse job result' }), 
          { status: 500, headers }
        );
      }
    } else if (job.status === 'failed') {
      result = {
        ...result,
        error: job.error || 'Processing failed'
      };
    }
    
    console.log('[PDF Status Check] Returning result:', { 
      status: result.status, 
      hasMarkdown: !!result.markdown,
      markdownLength: result.markdown?.length 
    });
    
    return new NextResponse(
      JSON.stringify(result), 
      { status: 200, headers }
    );
    
  } catch (error: any) {
    console.error('[PDF Status Check] Error:', error);
    return new NextResponse(
      JSON.stringify({ error: error.message || 'Failed to check job status' }), 
      { status: 500, headers }
    );
  }
} 