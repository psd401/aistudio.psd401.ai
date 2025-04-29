import { getAuth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/db';
import { conversationsTable, messagesTable, documentsTable } from '@/db/schema';
import { eq, and, asc } from 'drizzle-orm';
import { supabaseAdmin } from '@/lib/supabase/client';
import { getDocumentsByConversationId } from '@/lib/db/queries/documents';

export async function GET(
  req: NextRequest,
  { params }: { params: { conversationId: string } }
) {
  const { userId } = getAuth(req);
  
  if (!userId) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  try {
    const conversationId = parseInt(params.conversationId);
    
    // First get the conversation
    const [conversation] = await db
      .select()
      .from(conversationsTable)
      .where(
        and(
          eq(conversationsTable.id, conversationId),
          eq(conversationsTable.clerkId, userId)
        )
      );

    if (!conversation) {
      return new NextResponse('Not Found', { status: 404 });
    }

    // Then get the messages
    const conversationMessages = await db
      .select()
      .from(messagesTable)
      .where(eq(messagesTable.conversationId, conversationId))
      .orderBy(asc(messagesTable.createdAt));

    return NextResponse.json({ ...conversation, messages: conversationMessages });
  } catch (error) {
    console.error('Error fetching conversation:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { conversationId: string } }
) {
  const { userId } = getAuth(req);
  
  if (!userId) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  try {
    const conversationId = parseInt(params.conversationId);
    const { title } = await req.json();

    const [conversation] = await db
      .select()
      .from(conversationsTable)
      .where(
        and(
          eq(conversationsTable.id, conversationId),
          eq(conversationsTable.clerkId, userId)
        )
      );

    if (!conversation) {
      return new NextResponse('Not Found', { status: 404 });
    }

    const [updatedConversation] = await db
      .update(conversationsTable)
      .set({ title, updatedAt: new Date() })
      .where(eq(conversationsTable.id, conversationId))
      .returning();

    return NextResponse.json(updatedConversation);
  } catch (error) {
    console.error('Error updating conversation:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { conversationId: string } }
) {
  const { userId } = getAuth(req);
  
  if (!userId) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  try {
    const conversationId = parseInt(params.conversationId);
    
    const [conversation] = await db
      .select()
      .from(conversationsTable)
      .where(
        and(
          eq(conversationsTable.id, conversationId),
          eq(conversationsTable.clerkId, userId)
        )
      );

    if (!conversation) {
      return new NextResponse('Not Found', { status: 404 });
    }

    // Get all documents associated with this conversation
    const documents = await getDocumentsByConversationId({ conversationId });

    // Delete files from storage and clean up documents
    for (const document of documents) {
      // Delete file from storage
      const filePath = document.url.split('documents/')[1];
      if (filePath) {
        console.log(`[DELETE] Deleting file from storage: ${filePath}`);
        const { error: storageError } = await supabaseAdmin.storage
          .from('documents')
          .remove([filePath]);

        if (storageError) {
          console.error('[DELETE] Storage deletion error:', storageError);
          // Continue with database deletion even if storage deletion fails
        }
      }
    }

    await db.transaction(async (tx) => {
      // Delete all documents first (this will cascade delete document_chunks)
      if (documents.length > 0) {
        await tx
          .delete(documentsTable)
          .where(eq(documentsTable.conversationId, conversationId));
      }

      // Delete all messages
      await tx
        .delete(messagesTable)
        .where(eq(messagesTable.conversationId, conversationId));

      // Then delete the conversation
      await tx
        .delete(conversationsTable)
        .where(eq(conversationsTable.id, conversationId));
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('Error deleting conversation:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
} 