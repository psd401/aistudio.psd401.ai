import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { 
  getDocumentsByConversationId, 
  getDocumentById, 
  deleteDocumentById 
} from '@/lib/db/queries/documents';
import { getServerSession } from '@/lib/auth/server-session';
import { getCurrentUserAction } from '@/actions/db/get-current-user-action';

export async function GET(request: NextRequest) {
  // Check authentication
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  const currentUser = await getCurrentUserAction();
  if (!currentUser.isSuccess) {
    return NextResponse.json({ error: 'User not found' }, { status: 401 });
  }
  
  const userId = currentUser.data.user.id;

  // Get URL parameters
  const searchParams = request.nextUrl.searchParams;
  const conversationId = searchParams.get('conversationId');
  const documentId = searchParams.get('id');
  
  try {
    // If documentId is provided, fetch single document
    if (documentId) {
      const document = await getDocumentById({ id: documentId });
      
      if (!document) {
        return NextResponse.json({ 
          success: false, 
          error: 'Document not found' 
        }, { status: 404 });
      }
      
      // Check if the document belongs to the authenticated user
      if (document.userId !== userId) {
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
      const parsedConversationId = parseInt(conversationId, 10);
      
      if (isNaN(parsedConversationId)) {
        return NextResponse.json({ 
          success: false, 
          error: 'Invalid conversation ID' 
        }, { status: 400 });
      }
      
      const documents = await getDocumentsByConversationId({ 
        conversationId: parsedConversationId 
      });
      
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
    return NextResponse.json({ 
      success: false, 
      error: 'Missing parameters. Please provide conversationId or id.' 
    }, { status: 400 });
    
  } catch (error) {
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
  // Check authentication
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  const currentUser = await getCurrentUserAction();
  if (!currentUser.isSuccess) {
    return NextResponse.json({ error: 'User not found' }, { status: 401 });
  }
  
  const userId = currentUser.data.user.id;

  // Get URL parameters
  const searchParams = request.nextUrl.searchParams;
  const documentId = searchParams.get('id');

  if (!documentId) {
    return NextResponse.json({ 
      success: false, 
      error: 'Document ID is required' 
    }, { status: 400 });
  }

  try {
    // First check if the document exists and belongs to the user
    const document = await getDocumentById({ id: documentId });
    
    if (!document) {
      return NextResponse.json({ 
        success: false, 
        error: 'Document not found' 
      }, { status: 404 });
    }
    
    // Check if the document belongs to the authenticated user
    if (document.userId !== userId) {
      return NextResponse.json({ 
        success: false, 
        error: 'Unauthorized access to document' 
      }, { status: 403 });
    }

    // Delete the file from Supabase storage
    const filePath = document.url.split('documents/')[1]; // Extract path from URL
    if (filePath) {
      const { error: storageError } = await supabaseAdmin.storage
        .from('documents')
        .remove([filePath]);

      if (storageError) {
        // Continue with database deletion even if storage deletion fails
      }
    }
    
    // Delete the document from the database
    await deleteDocumentById({ id: documentId });
    
    return NextResponse.json({
      success: true,
      message: 'Document deleted successfully'
    });
  } catch (error) {
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to delete document' 
      },
      { status: 500 }
    );
  }
} 