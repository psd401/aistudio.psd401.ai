import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserAction } from "@/actions/db/get-current-user-action"
import { executeSQL } from "@/lib/db/data-api-adapter"
import { Field } from '@aws-sdk/client-rds-data';
import logger from '@/lib/logger';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  const currentUser = await getCurrentUserAction()
  if (!currentUser.isSuccess) {
    return new NextResponse("Unauthorized", { status: 401 })
  }
  const resolvedParams = await params
  const { conversationId } = resolvedParams

  try {
    const conversationQuery = `
      SELECT id, user_id, title, created_at, updated_at,
             model_id, source, execution_id, context
      FROM conversations
      WHERE id = :conversationId
        AND user_id = :userId
    `;
    const conversationParams = [
      { name: 'conversationId', value: { longValue: parseInt(conversationId, 10) } },
      { name: 'userId', value: { stringValue: String(currentUser.data.user.id) } }
    ];
    const conversationResult = await executeSQL(conversationQuery, conversationParams);
    const conversation = conversationResult[0];

    if (!conversation) {
      return new NextResponse("Conversation not found", { status: 404 })
    }

    const messagesQuery = `
      SELECT id, conversation_id, role, content, created_at, updated_at
      FROM messages
      WHERE conversation_id = :conversationId
      ORDER BY created_at ASC
    `;
    const messagesParams = [
      { name: 'conversationId', value: { longValue: parseInt(conversationId, 10) } as Field }
    ];
    const messages = await executeSQL(messagesQuery, messagesParams);

    const documentsQuery = `
      SELECT id, name, type, url, size, user_id, conversation_id, created_at
      FROM documents
      WHERE conversation_id = :conversationId
    `;
    const documents = await executeSQL(documentsQuery, messagesParams);

    return new NextResponse(
      JSON.stringify({ ...conversation, messages, documents }),
      {
        headers: { "Content-Type": "application/json" },
      }
    )
  } catch (error) {
    logger.error("Error fetching conversation details:", error)
    return new NextResponse("Internal Server Error", { status: 500 })
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  const currentUser = await getCurrentUserAction()
  if (!currentUser.isSuccess) {
    return new NextResponse("Unauthorized", { status: 401 })
  }
  const resolvedParams = await params
  const { conversationId } = resolvedParams
  const body = await req.json()

  // Verify ownership
  const checkQuery = `
    SELECT id FROM conversations
    WHERE id = :conversationId AND user_id = :userId
  `;
  const checkParams = [
    { name: 'conversationId', value: { longValue: parseInt(conversationId, 10) } },
    { name: 'userId', value: { stringValue: String(currentUser.data.user.id) } }
  ];
  const checkResult = await executeSQL(checkQuery, checkParams);

  if (!checkResult.length) {
    return new NextResponse("Conversation not found or access denied", {
      status: 404,
    })
  }

  try {
    const updateQuery = `
      UPDATE conversations
      SET title = :title, updated_at = NOW()
      WHERE id = :conversationId
      RETURNING id, user_id, title, created_at, updated_at, model_id, source, execution_id, context
    `;
    const updateParams = [
      { name: 'title', value: { stringValue: body.title || '' } },
      { name: 'conversationId', value: { longValue: parseInt(conversationId, 10) } }
    ];
    const updateResult = await executeSQL(updateQuery, updateParams);
    const updatedConversation = updateResult[0];

    return new NextResponse(JSON.stringify(updatedConversation), {
      headers: { "Content-Type": "application/json" },
    })
  } catch (error) {
    logger.error("Error updating conversation:", error)
    return new NextResponse("Internal Server Error", { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  const currentUser = await getCurrentUserAction()
  if (!currentUser.isSuccess) {
    return new NextResponse("Unauthorized", { status: 401 })
  }
  const resolvedParams = await params
  const { conversationId } = resolvedParams

  // Verify ownership
  const checkQuery = `
    SELECT id FROM conversations
    WHERE id = :conversationId AND user_id = :userId
  `;
  const checkParams = [
    { name: 'conversationId', value: { longValue: parseInt(conversationId, 10) } },
    { name: 'userId', value: { stringValue: String(currentUser.data.user.id) } }
  ];
  const checkResult = await executeSQL(checkQuery, checkParams);

  if (!checkResult.length) {
    return new NextResponse("Conversation not found or access denied", {
      status: 404,
    })
  }

  try {
    // Delete messages first due to foreign key constraint
    const deleteMessagesQuery = `
      DELETE FROM messages WHERE conversation_id = :conversationId
    `;
    await executeSQL(deleteMessagesQuery, [
      { name: 'conversationId', value: { longValue: parseInt(conversationId, 10) } }
    ]);
    
    // Then delete the conversation
    const deleteConversationQuery = `
      DELETE FROM conversations WHERE id = :conversationId
    `;
    await executeSQL(deleteConversationQuery, [
      { name: 'conversationId', value: { longValue: parseInt(conversationId, 10) } }
    ])

    return new NextResponse(null, { status: 204 })
  } catch (error) {
    logger.error("Error deleting conversation:", error)
    return new NextResponse("Internal Server Error", { status: 500 })
  }
} 