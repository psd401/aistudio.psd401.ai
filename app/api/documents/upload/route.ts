import logger from "@/lib/logger"

// Limit request body size to 25MB for uploads
export const config = {
  api: {
    bodyParser: {
      sizeLimit: "25mb"
    }
  }
}

console.log('[Upload API Module] Loading route.ts file...'); // Log module load

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { saveDocument, batchInsertDocumentChunks } from '@/lib/db/queries/documents';
import { extractTextFromDocument, chunkText, getFileTypeFromFileName } from '@/lib/document-processing';
// import * as fs from 'fs'; // No longer needed if text processing is out
// import * as path from 'path'; // No longer needed if text processing is out

// File size limit: 25MB
const MAX_FILE_SIZE = 25 * 1024 * 1024;

// Supported file types
const ALLOWED_FILE_EXTENSIONS = ['.pdf', '.docx', '.txt'];
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain'
];

// Enhanced file validation schema
const FileSchema = z.object({
  file: z.instanceof(Blob)
    .refine((file) => file.size <= MAX_FILE_SIZE, {
      message: `File size must be less than ${MAX_FILE_SIZE / (1024 * 1024)}MB`,
    })
    .refine((file) => {
      const fileName = (file as File).name || '';
      const fileExtension = `.${fileName.split('.').pop()?.toLowerCase()}`;
      return ALLOWED_FILE_EXTENSIONS.includes(fileExtension);
    }, {
      message: `Unsupported file extension. Allowed file types are: ${ALLOWED_FILE_EXTENSIONS.join(', ')}`,
    })
    .refine((file) => {
      const mimeType = (file as File).type;
      return ALLOWED_MIME_TYPES.includes(mimeType);
    }, {
      message: `Unsupported file type. Allowed MIME types are: ${ALLOWED_MIME_TYPES.join(', ')}`,
    })
});

// Helper function to ensure the documents bucket exists
async function ensureDocumentsBucket() {
  try {
    // Check if the bucket exists
    const { data: buckets, error } = await supabaseAdmin.storage.listBuckets();
    
    if (error) {
      logger.error('Error listing buckets:', error);
      throw new Error(`Failed to list storage buckets: ${error.message}`);
    }
    
    const documentsBucketExists = buckets.some(bucket => bucket.name === 'documents');
    logger.info('Checking for documents bucket:', documentsBucketExists ? 'exists' : 'does not exist');
    
    if (!documentsBucketExists) {
      logger.info('Documents bucket does not exist, creating it...');
      const { error: createError } = await supabaseAdmin.storage.createBucket('documents', {
        public: false, // Make the bucket private for security
        allowedMimeTypes: ALLOWED_MIME_TYPES,
        fileSizeLimit: MAX_FILE_SIZE
      });
      
      if (createError) {
        logger.error('Error creating documents bucket:', createError);
        throw new Error(`Failed to create documents bucket: ${createError.message}`);
      }
      
      logger.info('Documents bucket created successfully');
    } else {
      logger.info('Documents bucket already exists');
    }
    
    return true;
  } catch (error) {
    logger.error('Error in ensureDocumentsBucket:', error);
    throw error;
  }
}

// Ensure this route is built for the Node.js runtime so that Node-only   
// dependencies such as `pdf-parse` and `mammoth` (which rely on the FS   
// module and other Node APIs) work correctly. If this is omitted, Next.js   
// will attempt to bundle the route for the Edge runtime, leading to         
// unresolved module errors.                                                 
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  logger.info('[Upload API - Restore Step 1] Handler Entered');
  
  // Set response headers early to ensure proper content type
  const headers = {
    'Content-Type': 'application/json',
  };
  
  // Check authentication first
  logger.info('[Upload API] Attempting getAuth...');
  const { userId } = getAuth(request);
  logger.info(`[Upload API] getAuth completed. userId: ${userId}`);

  if (!userId) {
    logger.info('Unauthorized - No userId');
    return new NextResponse(
      JSON.stringify({ error: 'Unauthorized' }), 
      { status: 401, headers }
    );
  }

  // Add more checks before the main try block if needed

  try {
    logger.info('[Upload API] Inside main try block');
    // --- Original logic commented out for now ---
    /*
    // Ensure documents bucket exists
    // ... 
    // Parse form data
    // ...
    // Validate file
    // ...
    // Extract text
    // ...
    // Upload to storage
    // ...
    // Save metadata
    // ...
    // Chunk and save
    // ...
    */
    
    // Ensure documents bucket exists
    try {
      await ensureDocumentsBucket(); // Assuming ensureDocumentsBucket is defined above
    } catch (bucketError) {
      logger.error('[Upload API] Step failed: Ensuring Bucket', bucketError);
      return new NextResponse(
        JSON.stringify({ 
          success: false,
          error: `Failed to ensure storage is configured properly: ${bucketError instanceof Error ? bucketError.message : String(bucketError)}` 
        }), 
        { status: 500, headers }
      );
    }
    
    // Parse the form data
    let formData;
    try {
      formData = await request.formData();
      logger.info('[Upload API] Form data parsed');
    } catch (formError) {
      logger.error('[Upload API] Step failed: Parsing Form Data', formError);
      return new NextResponse(
        JSON.stringify({ 
          success: false,
          error: 'Invalid form data' 
        }), 
        { status: 400, headers }
      );
    }
    
    const file = formData.get('file') as File;
    
    logger.info('Form data received:', {
      fileName: file?.name,
      fileSize: file?.size
    });
    
    if (!file) {
      logger.info('No file uploaded in form data');
      return new NextResponse(
        JSON.stringify({ success: false, error: 'No file uploaded' }), 
        { status: 400, headers }
      );
    }
    
    // Validate file type with a comprehensive approach
    // 1. Check file extension
    const fileExtension = `.${file.name.split('.').pop()?.toLowerCase()}`;
    if (!ALLOWED_FILE_EXTENSIONS.includes(fileExtension)) {
      logger.info('Unsupported file extension:', fileExtension);
      return new NextResponse(
        JSON.stringify({ 
          success: false,
          error: `Unsupported file extension. Allowed file types are: ${ALLOWED_FILE_EXTENSIONS.join(', ')}` 
        }), 
        { status: 400, headers }
      );
    }
    
    // 2. Check MIME type for additional security
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      logger.info('Unsupported MIME type:', file.type);
      return new NextResponse(
        JSON.stringify({ 
          success: false,
          error: `Unsupported MIME type. Allowed MIME types are: ${ALLOWED_MIME_TYPES.join(', ')}` 
        }), 
        { status: 400, headers }
      );
    }

    const validatedFile = FileSchema.safeParse({ file });
    if (!validatedFile.success) {
      const errorMessage = validatedFile.error.errors.map((error) => error.message).join(', ');
      logger.info('File validation error:', errorMessage);
      return new NextResponse(
        JSON.stringify({ 
          success: false,
          error: errorMessage 
        }), 
        { status: 400, headers }
      );
    }

    // Extract file type from file name
    const fileType = getFileTypeFromFileName(file.name);
    logger.info('File type (using file name):', fileType);
    
    // Convert File to Buffer for processing (still needed for storage and non-PDF extraction)
    let fileBuffer: Buffer;
    try {
      fileBuffer = Buffer.from(await file.arrayBuffer());
      logger.info('File converted to buffer, size:', fileBuffer.length);
    } catch (bufferError) {
      logger.error('[Upload API] Step failed: Converting to Buffer', bufferError);
      return new NextResponse(
        JSON.stringify({ 
          success: false,
          error: 'Error processing file' 
        }), 
        { status: 500, headers }
      );
    }

    // Sanitize file name to prevent path traversal
    const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9_.-]/g, '_');
    
    // Create a safe, unique file path
    const filePath = `${userId}/${Date.now()}-${sanitizedFileName}`;
    logger.info('File path for storage:', filePath);
    
    // Upload file to Supabase Storage
    logger.info('Uploading to Supabase Storage...');
    const { error: uploadError, data: uploadData } = await supabaseAdmin.storage
      .from('documents')
      .upload(filePath, fileBuffer, {
        contentType: file.type,
        upsert: true // Use upsert to overwrite if file exists
      });

    if (uploadError) {
      logger.error('[Upload API] Step failed: Uploading to Storage', uploadError);
      return new NextResponse(
        JSON.stringify({ 
          success: false,
          error: `Failed to upload file to storage: ${uploadError.message}` 
        }), 
        { status: 500, headers }
      );
    }

    logger.info('File uploaded successfully to Supabase Storage:', uploadData);

    // Get signed URL for the uploaded file (valid for 1 hour)
    const { data: urlData, error: urlError } = await supabaseAdmin.storage
      .from('documents')
      .createSignedUrl(filePath, 3600); // 1 hour expiration

    if (urlError || !urlData || !urlData.signedUrl) {
      logger.error('[Upload API] Step failed: Getting Signed URL', urlError);
      return new NextResponse(
        JSON.stringify({ 
          success: false,
          error: 'Failed to get access URL for file' 
        }), 
        { status: 500, headers }
      );
    }

    const fileUrl = urlData.signedUrl;
    logger.info('Signed URL:', fileUrl);

    // Process document content for text extraction
    logger.info('Extracting text from document...');
    let text, metadata;
    try {
      // Use server-side extraction for all supported types
      const extracted = await extractTextFromDocument(fileBuffer, fileType);
      text = extracted.text;
      metadata = extracted.metadata;
      logger.info('Text extracted, length:', text?.length ?? 0);
    } catch (extractError) {
      logger.error('[Upload API] Step failed: Text Extraction', extractError);
      logger.error('Error extracting text from document:', extractError);
      return new NextResponse(
        JSON.stringify({ 
          success: false,
          error: `Failed to extract text from document: ${extractError instanceof Error ? extractError.message : String(extractError)}` 
        }), 
        { status: 500, headers }
      );
    }

    // Ensure text is not null or undefined before proceeding
    if (text === null || text === undefined) {
      logger.error('[Upload API] Text extraction resulted in null or undefined text.');
      return new NextResponse(
        JSON.stringify({ 
          success: false, 
          error: 'Failed to extract valid text content from the document.' 
        }), 
        { status: 500, headers }
      );
    }

    // Save document metadata to database
    logger.info('Saving document to database...');
    let document;
    try {
      document = await saveDocument({
        userId,
        conversationId: null, // Save with null conversationId initially
        name: sanitizedFileName, // Use the sanitized name
        type: fileType,
        size: file.size,
        url: fileUrl, // Use the signed URL
        // Ensure metadata is stringified if needed by DB schema (jsonb should handle objects)
        metadata: metadata, 
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      logger.info('Document saved to database:', document.id);
    } catch (saveError) {
      logger.error('[Upload API] Step failed: Saving Document Metadata', saveError);
      logger.error('Error saving document to database:', saveError);
      return new NextResponse(
        JSON.stringify({ 
          success: false,
          error: `Failed to save document to database: ${saveError instanceof Error ? saveError.message : String(saveError)}` 
        }), 
        { status: 500, headers }
      );
    }

    // Chunk text and save to database
    logger.info('Chunking text...');
    let chunks;
    try {
      chunks = chunkText(text);
      logger.info('Created', chunks.length, 'chunks');
      
      if (chunks.length === 0) {
        logger.warn('[Upload API] Chunking resulted in 0 chunks. Document might be empty or processing failed silently.');
        // Proceed to save document metadata but skip saving chunks
      } else {
        const documentChunks = chunks.map((chunk, index) => ({
          documentId: document.id,
          content: chunk,
          chunkIndex: index,
          metadata: { position: index }, // Simple metadata for chunk
          createdAt: new Date(),
          updatedAt: new Date(),
        }));

        logger.info('Saving chunks to database...');
        const savedChunks = await batchInsertDocumentChunks(documentChunks);
        logger.info('Saved', savedChunks.length, 'chunks to database');
      }
    } catch (chunkError) {
      logger.error('[Upload API] Step failed: Chunking/Saving Chunks', chunkError);
      logger.error('Error processing or saving chunks:', chunkError);
      // Attempt to clean up the document record if chunk saving fails?
      // await deleteDocumentById({ id: document.id }); // Optional cleanup
      return new NextResponse(
        JSON.stringify({ 
          success: false,
          error: `Failed to process or save document chunks: ${chunkError instanceof Error ? chunkError.message : String(chunkError)}` 
        }), 
        { status: 500, headers }
      );
    }

    // Verification happens when linked via chat API

    // Return the correct, full response object
    return new NextResponse(
      JSON.stringify({
        success: true,
        document: {
          id: document.id,
          name: document.name,
          type: document.type,
          size: document.size,
          url: document.url,
          totalChunks: chunks?.length ?? 0,
        }
      }), 
      { status: 200, headers }
    );
      
  } catch (error) {
    logger.error('[Upload API] General Error in POST handler (Restore Step 1):', error);
    logger.error('Detailed Error:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
    return new NextResponse(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed during restore step 1' 
      }),
      { status: 500, headers }
    );
  }
}

// All previous code removed for this basic test 