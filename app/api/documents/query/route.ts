import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from '@clerk/nextjs/server';
import { getDocumentsByConversationId, getDocumentChunksByDocumentId } from '@/lib/db/queries/documents';

export async function POST(request: NextRequest) {
  console.log('Document query API called');
  
  const { userId } = getAuth(request);
  
  if (!userId) {
    console.log('Unauthorized - No userId');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { conversationId, query } = body;

    console.log('Query params:', { conversationId, query });

    if (!conversationId) {
      console.log('Missing conversationId');
      return NextResponse.json({ error: 'Conversation ID is required' }, { status: 400 });
    }

    if (!query || typeof query !== 'string') {
      console.log('Invalid query:', query);
      return NextResponse.json({ error: 'Query is required and must be a string' }, { status: 400 });
    }

    // Get documents for the conversation
    console.log('Fetching documents for conversation:', conversationId);
    const documents = await getDocumentsByConversationId({ conversationId: parseInt(conversationId) });
    console.log('Found', documents.length, 'documents for conversation');
    
    if (documents.length === 0) {
      return NextResponse.json({
        success: true,
        results: [],
        message: 'No documents found for this conversation'
      });
    }

    // Get document chunks for each document
    console.log('Fetching chunks for', documents.length, 'documents');
    const documentChunksPromises = documents.map(doc => 
      getDocumentChunksByDocumentId({ documentId: doc.id })
    );
    const documentChunksArrays = await Promise.all(documentChunksPromises);
    
    // Flatten the array of document chunks
    const allDocumentChunks = documentChunksArrays.flat();
    console.log('Found', allDocumentChunks.length, 'total chunks');

    // For now, implement a simple text search
    // In a real implementation, you would use embeddings and vector search
    console.log('Searching for query:', query);
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
          relevance: (chunk.content.toLowerCase().match(new RegExp(query.toLowerCase(), 'g')) || []).length
        };
      })
      .sort((a, b) => b.relevance - a.relevance) // Sort by relevance
      .slice(0, 5); // Limit to top 5 results

    console.log('Found', searchResults.length, 'matching chunks');

    return NextResponse.json({
      success: true,
      results: searchResults,
      totalResults: searchResults.length
    });
  } catch (error) {
    console.error('Error querying documents:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to query documents' },
      { status: 500 }
    );
  }
} 