import { getAuth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/db';
import { conversationsTable, messagesTable, documentsTable } from '@/db/schema';
import { eq, and, asc } from 'drizzle-orm';
import { supabaseAdmin } from '@/lib/supabase/client';
import { getDocumentsByConversationId } from '@/lib/db/queries/documents';
import { getCurrentUserAction } from "@/actions/db/get-current-user-action"

export async function GET(
  req: NextRequest,
  { params }: { params: { conversationId: string } }
) {
  const currentUser = await getCurrentUserAction()
  if (!currentUser.isSuccess) {
    return new NextResponse("Unauthorized", { status: 401 })
  }
  const { conversationId } = params

  try {
    const [conversation] = await db
      .select()
      .from(conversationsTable)
      .where(
        and(
          eq(conversationsTable.id, parseInt(conversationId, 10)),
          eq(conversationsTable.userId, currentUser.data.user.id)
        )
      )

    if (!conversation) {
      return new NextResponse("Conversation not found", { status: 404 })
    }

    const messages = await db
      .select()
      .from(messagesTable)
      .where(eq(messagesTable.conversationId, parseInt(conversationId, 10)))
      .orderBy(messagesTable.createdAt)

    const documents = await db
      .select()
      .from(documentsTable)
      .where(eq(documentsTable.conversationId, parseInt(conversationId, 10)))

    return new NextResponse(
      JSON.stringify({ ...conversation, messages, documents }),
      {
        headers: { "Content-Type": "application/json" },
      }
    )
  } catch (error) {
    console.error("Error fetching conversation details:", error)
    return new NextResponse("Internal Server Error", { status: 500 })
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { conversationId: string } }
) {
  const currentUser = await getCurrentUserAction()
  if (!currentUser.isSuccess) {
    return new NextResponse("Unauthorized", { status: 401 })
  }
  const { conversationId } = params
  const body = await req.json()

  // Verify ownership
  const [conversation] = await db
    .select()
    .from(conversationsTable)
    .where(
      and(
        eq(conversationsTable.id, parseInt(conversationId, 10)),
        eq(conversationsTable.userId, currentUser.data.user.id)
      )
    )

  if (!conversation) {
    return new NextResponse("Conversation not found or access denied", {
      status: 404,
    })
  }

  try {
    const [updatedConversation] = await db
      .update(conversationsTable)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(conversationsTable.id, parseInt(conversationId, 10)))
      .returning()

    return new NextResponse(JSON.stringify(updatedConversation), {
      headers: { "Content-Type": "application/json" },
    })
  } catch (error) {
    console.error("Error updating conversation:", error)
    return new NextResponse("Internal Server Error", { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { conversationId: string } }
) {
  const currentUser = await getCurrentUserAction()
  if (!currentUser.isSuccess) {
    return new NextResponse("Unauthorized", { status: 401 })
  }
  const { conversationId } = params

  // Verify ownership
  const [conversation] = await db
    .select()
    .from(conversationsTable)
    .where(
      and(
        eq(conversationsTable.id, parseInt(conversationId, 10)),
        eq(conversationsTable.userId, currentUser.data.user.id)
      )
    )

  if (!conversation) {
    return new NextResponse("Conversation not found or access denied", {
      status: 404,
    })
  }

  try {
    await db
      .delete(conversationsTable)
      .where(eq(conversationsTable.id, parseInt(conversationId, 10)))

    return new NextResponse(null, { status: 204 })
  } catch (error) {
    console.error("Error deleting conversation:", error)
    return new NextResponse("Internal Server Error", { status: 500 })
  }
} 