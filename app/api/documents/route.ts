import { NextRequest, NextResponse } from 'next/server';
import { getDocumentSignedUrl, deleteDocument } from '@/lib/aws/s3-client';
import { 
  getDocumentsByConversationId, 
  getDocumentById, 
  deleteDocumentById 
} from '@/lib/db/queries/documents';
import { getServerSession } from '@/lib/auth/server-session';
import { getCurrentUserAction } from '@/actions/db/get-current-user-action';
import logger from '@/lib/logger';

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
      if (document.user_id !== userId) {
        return NextResponse.json({ 
          success: false, 
          error: 'Unauthorized access to document' 
        }, { status: 403 });
      }

      // Get a fresh signed URL for the document
      // document.url now contains the S3 key
      let signedUrl;
      try {
        signedUrl = await getDocumentSignedUrl({
          key: document.url,
          expiresIn: 3600 // 1 hour
        });
      } catch (error) {
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
          url: signedUrl
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
          try {
            const signedUrl = await getDocumentSignedUrl({
              key: doc.url,
              expiresIn: 3600 // 1 hour
            });
            return {
              ...doc,
              url: signedUrl
            };
          } catch (error) {
            // If we can't generate a signed URL, return the document without it
            return doc;
          }
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

  const docId = parseInt(documentId, 10);
  if (isNaN(docId)) {
    return NextResponse.json({ 
      success: false, 
      error: 'Invalid document ID' 
    }, { status: 400 });
  }

  try {
    // First check if the document exists and belongs to the user
    const document = await getDocumentById({ id: docId });
    
    if (!document) {
      return NextResponse.json({ 
        success: false, 
        error: 'Document not found' 
      }, { status: 404 });
    }
    
    // Check if the document belongs to the authenticated user
    if (document.user_id !== userId) {
      return NextResponse.json({ 
        success: false, 
        error: 'Unauthorized access to document' 
      }, { status: 403 });
    }

    // Delete the file from S3
    if (document.url) {
      try {
        await deleteDocument(document.url);
      } catch (storageError) {
        // Continue with database deletion even if storage deletion fails
        logger.error('Failed to delete from S3:', storageError);
      }
    }
    
    // Delete the document from the database
    await deleteDocumentById({ id: docId });
    
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