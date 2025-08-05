import { NextRequest, NextResponse } from 'next/server';
import logger from "@/lib/logger"

// Limit request body size to 25MB for uploads
export const config = {
  api: {
    bodyParser: {
      sizeLimit: "25mb"
    }
  }
}
import { z } from 'zod';
import { uploadDocument } from '@/lib/aws/s3-client';
import { saveDocument, batchInsertDocumentChunks } from '@/lib/db/queries/documents';
import { extractTextFromDocument, chunkText, getFileTypeFromFileName } from '@/lib/document-processing';
import { getServerSession } from '@/lib/auth/server-session';
import { getCurrentUserAction } from '@/actions/db/get-current-user-action';
// import * as fs from 'fs'; // No longer needed if text processing is out
// import * as path from 'path'; // No longer needed if text processing is out

import { 
  ALLOWED_FILE_EXTENSIONS,
  ALLOWED_MIME_TYPES,
  getMaxFileSize
} from '@/lib/file-validation';

// Enhanced file validation schema
// Using z.any() since File/Blob classes are not available during SSR/build
const FileSchema = z.object({
  file: z.any()
    .refine((file) => {
      // Runtime check for file-like object
      return file && typeof file === 'object' && 'size' in file && 'name' in file && 'type' in file;
    }, {
      message: 'Invalid file object',
    })
    .refine((file) => {
      const fileName = file.name || '';
      const fileExtension = `.${fileName.split('.').pop()?.toLowerCase()}`;
      return ALLOWED_FILE_EXTENSIONS.includes(fileExtension as typeof ALLOWED_FILE_EXTENSIONS[number]);
    }, {
      message: `Unsupported file extension. Allowed file types are: ${ALLOWED_FILE_EXTENSIONS.join(', ')}`,
    })
    .refine((file) => {
      const mimeType = file.type;
      return ALLOWED_MIME_TYPES.includes(mimeType as typeof ALLOWED_MIME_TYPES[number]);
    }, {
      message: `Unsupported file type. Allowed MIME types are: ${ALLOWED_MIME_TYPES.join(', ')}`,
    })
});


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
  logger.info('[Upload API] Attempting getServerSession...');
  const session = await getServerSession();
  logger.info(`[Upload API] getServerSession completed. session exists: ${!!session}`);

  if (!session) {
    logger.info('Unauthorized - No session');
    return new NextResponse(
      JSON.stringify({ error: 'Unauthorized' }), 
      { status: 401, headers }
    );
  }
  
  const currentUser = await getCurrentUserAction();
  if (!currentUser.isSuccess || !currentUser.data?.user) {
    logger.info('Unauthorized - User not found');
    return new NextResponse(
      JSON.stringify({ error: 'User not found' }), 
      { status: 401, headers }
    );
  }
  
  const userId = currentUser.data.user.id;
  logger.info(`Current user ID: ${userId}, type: ${typeof userId}`);

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
    if (!ALLOWED_FILE_EXTENSIONS.includes(fileExtension as typeof ALLOWED_FILE_EXTENSIONS[number])) {
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
    if (!ALLOWED_MIME_TYPES.includes(file.type as typeof ALLOWED_MIME_TYPES[number])) {
      logger.info('Unsupported MIME type:', file.type);
      return new NextResponse(
        JSON.stringify({ 
          success: false,
          error: `Unsupported MIME type. Allowed MIME types are: ${ALLOWED_MIME_TYPES.join(', ')}` 
        }), 
        { status: 400, headers }
      );
    }
    
    // 3. Check file size
    const maxFileSize = await getMaxFileSize();
    if (file.size > maxFileSize) {
      logger.info('File too large:', file.size, 'Max:', maxFileSize);
      return new NextResponse(
        JSON.stringify({ 
          success: false,
          error: `File size must be less than ${maxFileSize / (1024 * 1024)}MB` 
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
    logger.info(`File type (using file name): ${fileType}`);
    
    // Convert File to Buffer for processing (still needed for storage and non-PDF extraction)
    let fileBuffer: Buffer;
    try {
      fileBuffer = Buffer.from(await file.arrayBuffer());
      logger.info(`File converted to buffer, size: ${fileBuffer.length}`);
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
    
    
    // Upload file to AWS S3
    logger.info('Uploading to AWS S3...');
    let uploadResult;
    try {
      uploadResult = await uploadDocument({
        userId: String(userId),
        fileName: sanitizedFileName,
        fileContent: fileBuffer,
        contentType: file.type,
        metadata: {
          originalName: file.name,
          uploadedBy: String(userId),
        }
      });
      logger.info('File uploaded successfully to S3:', uploadResult);
    } catch (uploadError) {
      logger.error('[Upload API] Step failed: Uploading to S3', uploadError);
      return new NextResponse(
        JSON.stringify({ 
          success: false,
          error: `Failed to upload file to storage: ${uploadError instanceof Error ? uploadError.message : String(uploadError)}` 
        }), 
        { status: 500, headers }
      );
    }

    const fileUrl = uploadResult.url;
    const s3Key = uploadResult.key;
    logger.info(`S3 key: ${s3Key}`);
    logger.info(`Signed URL: ${fileUrl}`);

    // Process document content for text extraction
    logger.info('Extracting text from document...');
    let text, metadata;
    try {
      // Use server-side extraction for all supported types
      const extracted = await extractTextFromDocument(fileBuffer, fileType);
      text = extracted.text;
      metadata = extracted.metadata;
      logger.info(`Text extracted, length: ${text?.length ?? 0}`);
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
        url: s3Key, // Store S3 key, we'll generate signed URLs on demand
        metadata: metadata || {}, // Ensure metadata is not undefined
      });
      logger.info(`Document saved to database: ${document.id}`);
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
      logger.info(`Created ${chunks.length} chunks`);
      
      if (chunks.length === 0) {
        logger.warn('[Upload API] Chunking resulted in 0 chunks. Document might be empty or processing failed silently.');
        // Proceed to save document metadata but skip saving chunks
      } else {
        const documentChunks = chunks.map((chunk, index) => ({
          documentId: document.id,
          content: chunk,
          chunkIndex: index,
          metadata: { position: index }, // Simple metadata for chunk
        }));

        logger.info('Saving chunks to database...');
        const savedChunks = await batchInsertDocumentChunks(documentChunks);
        logger.info(`Saved ${savedChunks.length} chunks to database`);
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