console.log('[Upload API Module] Loading route.ts file...'); // Log module load

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { saveDocument, batchInsertDocumentChunks, getDocumentsByConversationId } from '@/lib/db/queries/documents';
import { extractTextFromDocument, chunkText, getFileTypeFromFileName } from '@/lib/document-processing';
// import * as fs from 'fs'; // No longer needed if text processing is out
// import * as path from 'path'; // No longer needed if text processing is out

// File size limit: 10MB
const MAX_FILE_SIZE = 10 * 1024 * 1024;

// Supported file types
const ALLOWED_FILE_EXTENSIONS = ['.pdf', '.docx', '.txt'];

const FileSchema = z.object({
  file: z.instanceof(Blob)
    .refine((file) => file.size <= MAX_FILE_SIZE, {
      message: `File size must be less than ${MAX_FILE_SIZE / (1024 * 1024)}MB`,
    })
});

// Helper function to ensure the documents bucket exists
async function ensureDocumentsBucket() {
  try {
    // Check if the bucket exists
    const { data: buckets, error } = await supabaseAdmin.storage.listBuckets();
    
    if (error) {
      console.error('Error listing buckets:', error);
      throw new Error(`Failed to list storage buckets: ${error.message}`);
    }
    
    const documentsBucketExists = buckets.some(bucket => bucket.name === 'documents');
    console.log('Checking for documents bucket:', documentsBucketExists ? 'exists' : 'does not exist');
    
    if (!documentsBucketExists) {
      console.log('Documents bucket does not exist, creating it...');
      const { error: createError } = await supabaseAdmin.storage.createBucket('documents', {
        public: true, // This should make the bucket public by default
        allowedMimeTypes: ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'],
        fileSizeLimit: MAX_FILE_SIZE
      });
      
      if (createError) {
        console.error('Error creating documents bucket:', createError);
        throw new Error(`Failed to create documents bucket: ${createError.message}`);
      }
      
      console.log('Documents bucket created successfully');
    } else {
      console.log('Documents bucket already exists');
    }
    
    return true;
  } catch (error) {
    console.error('Error in ensureDocumentsBucket:', error);
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
  console.log('[Upload API - Restore Step 1] Handler Entered');
  
  // Check authentication first
  console.log('[Upload API] Attempting getAuth...');
  const { userId } = getAuth(request);
  console.log(`[Upload API] getAuth completed. userId: ${userId}`);

  if (!userId) {
    console.log('Unauthorized - No userId');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Add more checks before the main try block if needed

  try {
    console.log('[Upload API] Inside main try block');
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
      console.error('[Upload API] Step failed: Ensuring Bucket', bucketError);
      return NextResponse.json({ 
        success: false,
        error: `Failed to ensure storage is configured properly: ${bucketError instanceof Error ? bucketError.message : String(bucketError)}` 
      }, { status: 500 });
    }
    
    // Parse the form data
    let formData;
    try {
      formData = await request.formData();
      console.log('[Upload API] Form data parsed');
    } catch (formError) {
      console.error('[Upload API] Step failed: Parsing Form Data', formError);
      return NextResponse.json({ 
        success: false,
        error: 'Invalid form data' 
      }, { status: 400 });
    }
    
    const file = formData.get('file') as File;
    
    console.log('Form data received:', {
      fileName: file?.name,
      fileSize: file?.size
    });
    
    if (!file) {
      console.log('No file uploaded in form data');
      return NextResponse.json({ success: false, error: 'No file uploaded' }, { status: 400 });
    }
    
    // Validate file type
    const fileExtension = `.${file.name.split('.').pop()?.toLowerCase()}`;
    if (!ALLOWED_FILE_EXTENSIONS.includes(fileExtension)) {
      console.log('Unsupported file type:', fileExtension);
      return NextResponse.json({ 
        success: false,
        error: `Unsupported file type. Allowed file types are: ${ALLOWED_FILE_EXTENSIONS.join(', ')}` 
      }, { status: 400 });
    }

    const validatedFile = FileSchema.safeParse({ file });
    if (!validatedFile.success) {
      const errorMessage = validatedFile.error.errors.map((error) => error.message).join(', ');
      console.log('File validation error:', errorMessage);
      return NextResponse.json({ 
        success: false,
        error: errorMessage 
      }, { status: 400 });
    }

    // Extract file type from file name
    const fileType = getFileTypeFromFileName(file.name);
    console.log('File type (using file name):', fileType);
    
    // Convert File to Buffer for processing (still needed for storage and non-PDF extraction)
    let fileBuffer: Buffer;
    try {
      fileBuffer = Buffer.from(await file.arrayBuffer());
      console.log('File converted to buffer, size:', fileBuffer.length);
    } catch (bufferError) {
      console.error('[Upload API] Step failed: Converting to Buffer', bufferError);
      return NextResponse.json({ 
        success: false,
        error: 'Error processing file' 
      }, { status: 500 });
    }

    // Create a unique file path
    const filePath = `${userId}/${Date.now()}-${file.name}`;
    console.log('File path for storage:', filePath);
    
    // Upload file to Supabase Storage
    console.log('Uploading to Supabase Storage...');
    const { error: uploadError, data: uploadData } = await supabaseAdmin.storage
      .from('documents')
      .upload(filePath, fileBuffer, {
        contentType: file.type,
        upsert: true // Use upsert to overwrite if file exists
      });

    if (uploadError) {
      console.error('[Upload API] Step failed: Uploading to Storage', uploadError);
      return NextResponse.json({ 
        success: false,
        error: `Failed to upload file to storage: ${uploadError.message}` 
      }, { status: 500 });
    }

    console.log('File uploaded successfully to Supabase Storage:', uploadData);

    // Get public URL for the uploaded file
    let publicUrl: string;
    const { data: urlData } = supabaseAdmin.storage
      .from('documents')
      .getPublicUrl(filePath);

    if (!urlData || !urlData.publicUrl) {
      console.error('[Upload API] Step failed: Getting Public URL');
      return NextResponse.json({ 
        success: false,
        error: 'Failed to get public URL for file' 
      }, { status: 500 });
    }

    publicUrl = urlData.publicUrl;
    console.log('Public URL:', publicUrl);

    // Process document content for text extraction
    console.log('Extracting text from document...');
    let text, metadata;
    try {
      // Use server-side extraction for all supported types
      const extracted = await extractTextFromDocument(fileBuffer, fileType);
      text = extracted.text;
      metadata = extracted.metadata;
      console.log('Text extracted, length:', text?.length ?? 0);
    } catch (extractError) {
      console.error('[Upload API] Step failed: Text Extraction', extractError);
      console.error('Error extracting text from document:', extractError);
      return NextResponse.json({ 
        success: false,
        error: `Failed to extract text from document: ${extractError instanceof Error ? extractError.message : String(extractError)}` 
      }, { status: 500 });
    }

    // Ensure text is not null or undefined before proceeding
    if (text === null || text === undefined) {
      console.error('[Upload API] Text extraction resulted in null or undefined text.');
      return NextResponse.json({ 
        success: false, 
        error: 'Failed to extract valid text content from the document.' 
      }, { status: 500 });
    }

    // Save document metadata to database
    console.log('Saving document to database...');
    let document;
    try {
      document = await saveDocument({
        userId,
        conversationId: null, // Save with null conversationId initially
        name: file.name,
        type: fileType,
        size: file.size,
        url: publicUrl,
        // Ensure metadata is stringified if needed by DB schema (jsonb should handle objects)
        metadata: metadata, 
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      console.log('Document saved to database:', document.id);
    } catch (saveError) {
      console.error('[Upload API] Step failed: Saving Document Metadata', saveError);
      console.error('Error saving document to database:', saveError);
      return NextResponse.json({ 
        success: false,
        error: `Failed to save document to database: ${saveError instanceof Error ? saveError.message : String(saveError)}` 
      }, { status: 500 });
    }

    // Chunk text and save to database
    console.log('Chunking text...');
    let chunks;
    try {
      chunks = chunkText(text);
      console.log('Created', chunks.length, 'chunks');
      
      if (chunks.length === 0) {
        console.warn('[Upload API] Chunking resulted in 0 chunks. Document might be empty or processing failed silently.');
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

        console.log('Saving chunks to database...');
        const savedChunks = await batchInsertDocumentChunks(documentChunks);
        console.log('Saved', savedChunks.length, 'chunks to database');
      }
    } catch (chunkError) {
      console.error('[Upload API] Step failed: Chunking/Saving Chunks', chunkError);
      console.error('Error processing or saving chunks:', chunkError);
      // Attempt to clean up the document record if chunk saving fails?
      // await deleteDocumentById({ id: document.id }); // Optional cleanup
      return NextResponse.json({ 
        success: false,
        error: `Failed to process or save document chunks: ${chunkError instanceof Error ? chunkError.message : String(chunkError)}` 
      }, { status: 500 });
    }

    // Verification happens when linked via chat API

    // Return the correct, full response object
    return NextResponse.json({
      success: true,
      document: {
        id: document.id,
        name: document.name,
        type: document.type,
        size: document.size,
        url: document.url,
        totalChunks: chunks?.length ?? 0,
      }
    });
      
  } catch (error) {
    console.error('[Upload API] General Error in POST handler (Restore Step 1):', error);
    console.error('Detailed Error:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed during restore step 1' 
      },
      { status: 500 }
    );
  }
}

// All previous code removed for this basic test 