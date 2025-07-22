import { NextRequest, NextResponse } from 'next/server';
import _ from 'lodash';
import { getServerSession } from '@/lib/auth/server-session';
import { getCurrentUserAction } from '@/actions/db/get-current-user-action';
import { getDocumentsByConversationId, getDocumentChunksByDocumentId } from '@/lib/db/queries/documents';

export async function POST(request: NextRequest) {
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

  try {
    const body = await request.json();
    const { conversationId, query } = body;

    if (!conversationId) {
      return NextResponse.json({ error: 'Conversation ID is required' }, { status: 400 });
    }

    if (!query || typeof query !== 'string') {
      return NextResponse.json({ error: 'Query is required and must be a string' }, { status: 400 });
    }

    // Get documents for the conversation
    const documents = await getDocumentsByConversationId({ conversationId: parseInt(conversationId) });
    
    if (documents.length === 0) {
      return NextResponse.json({
        success: true,
        results: [],
        message: 'No documents found for this conversation'
      });
    }

    // Get document chunks for each document
    const documentChunksPromises = documents.map(doc => 
      getDocumentChunksByDocumentId({ documentId: doc.id })
    );
    const documentChunksArrays = await Promise.all(documentChunksPromises);
    
    // Flatten the array of document chunks
    const allDocumentChunks = documentChunksArrays.flat();

    // For now, implement a simple text search
    // In a real implementation, you would use embeddings and vector search
    const searchResults = allDocumentChunks
      .filter(chunk => chunk.content.toLowerCase().includes(query.toLowerCase()))
      .map(chunk => {
        const document = documents.find(doc => doc.id === chunk.documentId);
        return {
          documentId: chunk.documentId,
          documentName: document?.name || 'Unknown document',
          chunkIndex: chunk.chunkIndex,
          content: chunk.content,
          // Calculate a simple relevance score based on occurrence count
          relevance: (chunk.content.toLowerCase().match(new RegExp(_.escapeRegExp(query.toLowerCase()), 'g')) || []).length
        };
      })
      .sort((a, b) => b.relevance - a.relevance) // Sort by relevance
      .slice(0, 5); // Limit to top 5 results

    return NextResponse.json({
      success: true,
      results: searchResults,
      totalResults: searchResults.length
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to query documents' },
      { status: 500 }
    );
  }
} 