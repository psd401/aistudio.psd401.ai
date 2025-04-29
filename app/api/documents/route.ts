import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { 
  getDocumentsByConversationId, 
  getDocumentById, 
  deleteDocumentById 
} from '@/lib/db/queries/documents';

export async function GET(request: NextRequest) {
  console.log('[documents GET] Request received');
  console.log('[documents GET] URL:', request.url);
  console.log('[documents GET] Headers:', Object.fromEntries(request.headers.entries()));
  
  // Check authentication
  const { userId } = getAuth(request);
  if (!userId) {
    console.log('[documents GET] Unauthorized - No userId');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Get URL parameters
  const searchParams = request.nextUrl.searchParams;
  const conversationId = searchParams.get('conversationId');
  const documentId = searchParams.get('id');
  
  console.log('[documents GET] Parameters:', { conversationId, documentId, userId });

  try {
    // If documentId is provided, fetch single document
    if (documentId) {
      console.log(`[documents GET] Fetching document with ID: ${documentId}`);
      const document = await getDocumentById({ id: documentId });
      
      if (!document) {
        console.log(`[documents GET] Document not found: ${documentId}`);
        return NextResponse.json({ 
          success: false, 
          error: 'Document not found' 
        }, { status: 404 });
      }
      
      // Check if the document belongs to the authenticated user
      if (document.userId !== userId) {
        console.log(`[documents GET] Unauthorized access to document: ${documentId}. Owner: ${document.userId}, Requester: ${userId}`);
        return NextResponse.json({ 
          success: false, 
          error: 'Unauthorized access to document' 
        }, { status: 403 });
      }

      // Get a fresh signed URL for the document
      const filePath = document.url.split('documents/')[1]; // Extract path from URL
      const { data: urlData } = await supabaseAdmin.storage
        .from('documents')
        .createSignedUrl(filePath, 60); // URL valid for 60 seconds

      if (!urlData?.signedUrl) {
        console.error('[documents GET] Failed to generate signed URL');
        return NextResponse.json({
          success: false,
          error: 'Failed to generate document access URL'
        }, { status: 500 });
      }

      // Return document with fresh signed URL
      return NextResponse.json({
        success: true,
        document: {
          ...document,
          url: urlData.signedUrl
        }
      });
    }
    
    // If conversationId is provided, fetch documents for conversation
    if (conversationId) {
      console.log(`[documents GET] Fetching documents for conversation: ${conversationId}, user: ${userId}`);
      const parsedConversationId = parseInt(conversationId, 10);
      
      if (isNaN(parsedConversationId)) {
        console.log(`[documents GET] Invalid conversation ID: ${conversationId}`);
        return NextResponse.json({ 
          success: false, 
          error: 'Invalid conversation ID' 
        }, { status: 400 });
      }
      
      console.log(`[documents GET] Calling getDocumentsByConversationId for conversation: ${parsedConversationId}`);
      const documents = await getDocumentsByConversationId({ 
        conversationId: parsedConversationId 
      });
      
      console.log(`[documents GET] Found ${documents.length} documents for conversation ${conversationId}`);
      console.log(`[documents GET] Document details:`, documents.map(doc => ({
        id: doc.id, 
        name: doc.name,
        userId: doc.userId,
        conversationId: doc.conversationId
      })));
      
      // Get fresh signed URLs for all documents
      const documentsWithSignedUrls = await Promise.all(
        documents.map(async (doc) => {
          const filePath = doc.url.split('documents/')[1];
          const { data: urlData } = await supabaseAdmin.storage
            .from('documents')
            .createSignedUrl(filePath, 60);
          
          return {
            ...doc,
            url: urlData?.signedUrl || doc.url
          };
        })
      );
      
      return NextResponse.json({
        success: true,
        documents: documentsWithSignedUrls
      });
    }
    
    // If no parameters provided, return error
    console.log('[documents GET] Missing parameters');
    return NextResponse.json({ 
      success: false, 
      error: 'Missing parameters. Please provide conversationId or id.' 
    }, { status: 400 });
    
  } catch (error) {
    console.error('[documents GET] Error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to fetch documents' 
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  console.log('[documents DELETE] Request received');
  
  // Check authentication
  const { userId } = getAuth(request);
  if (!userId) {
    console.log('[documents DELETE] Unauthorized - No userId');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Get URL parameters
  const searchParams = request.nextUrl.searchParams;
  const documentId = searchParams.get('id');

  if (!documentId) {
    console.log('[documents DELETE] Missing document ID');
    return NextResponse.json({ 
      success: false, 
      error: 'Document ID is required' 
    }, { status: 400 });
  }

  try {
    // First check if the document exists and belongs to the user
    const document = await getDocumentById({ id: documentId });
    
    if (!document) {
      console.log(`[documents DELETE] Document not found: ${documentId}`);
      return NextResponse.json({ 
        success: false, 
        error: 'Document not found' 
      }, { status: 404 });
    }
    
    // Check if the document belongs to the authenticated user
    if (document.userId !== userId) {
      console.log(`[documents DELETE] Unauthorized deletion attempt: ${documentId}`);
      return NextResponse.json({ 
        success: false, 
        error: 'Unauthorized access to document' 
      }, { status: 403 });
    }

    // Delete the file from Supabase storage
    const filePath = document.url.split('documents/')[1]; // Extract path from URL
    if (filePath) {
      console.log(`[documents DELETE] Deleting file from storage: ${filePath}`);
      const { error: storageError } = await supabaseAdmin.storage
        .from('documents')
        .remove([filePath]);

      if (storageError) {
        console.error('[documents DELETE] Storage deletion error:', storageError);
        // Continue with database deletion even if storage deletion fails
      }
    }
    
    // Delete the document from the database
    console.log(`[documents DELETE] Deleting document from database: ${documentId}`);
    await deleteDocumentById({ id: documentId });
    
    return NextResponse.json({
      success: true,
      message: 'Document deleted successfully'
    });
  } catch (error) {
    console.error('[documents DELETE] Error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to delete document' 
      },
      { status: 500 }
    );
  }
} 