import { NextRequest, NextResponse } from 'next/server';
import { linkDocumentToConversation, getDocumentById } from '@/lib/db/queries/documents';
import { withErrorHandling, unauthorized, badRequest } from '@/lib/api-utils';
import { createError } from '@/lib/error-utils';
import { getServerSession } from '@/lib/auth/server-session';
import { getCurrentUserAction } from '@/actions/db/get-current-user-action';
import logger from '@/lib/logger';

export async function POST(request: NextRequest) {
  const session = await getServerSession();
  if (!session) {
    return unauthorized('User not authenticated');
  }
  
  const currentUser = await getCurrentUserAction();
  if (!currentUser.isSuccess) {
    return unauthorized('User not found');
  }
  
  const userId = currentUser.data.user.id;
  logger.info(`Link API - Current user ID: ${userId}, type: ${typeof userId}`);

  return withErrorHandling(async () => {
    const body = await request.json();
    const { documentId, conversationId } = body;

    if (!documentId) {
      throw createError('Document ID is required', {
        code: 'VALIDATION',
        level: 'warn',
        details: { field: 'documentId' }
      });
    }

    if (!conversationId) {
      throw createError('Conversation ID is required', {
        code: 'VALIDATION',
        level: 'warn',
        details: { field: 'conversationId' }
      });
    }

    // Verify the document belongs to the user
    const document = await getDocumentById({ id: documentId });
    if (!document) {
      throw createError('Document not found', {
        code: 'NOT_FOUND',
        level: 'warn',
        details: { documentId }
      });
    }

    logger.info(`Document user_id: ${document.user_id}, type: ${typeof document.user_id}`);
    logger.info(`Current userId: ${userId}, type: ${typeof userId}`);
    logger.info(`Comparison: ${document.user_id} !== ${userId} = ${document.user_id !== userId}`);

    if (document.user_id !== userId) {
      throw createError('Access denied to document', {
        code: 'FORBIDDEN',
        level: 'warn',
        details: { documentId, userId, documentUserId: document.user_id }
      });
    }

    // Link the document to the conversation
    const updatedDocument = await linkDocumentToConversation(documentId, conversationId);
    
    if (!updatedDocument) {
      throw createError('Failed to link document to conversation', {
        code: 'INTERNAL_ERROR',
        level: 'error',
        details: { documentId, conversationId }
      });
    }

    return {
      success: true,
      document: updatedDocument
    };
  });
}