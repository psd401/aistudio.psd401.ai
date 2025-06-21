import { getAuth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/db';
import { conversationsTable, type InsertConversation } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import { getCurrentUserAction } from "@/actions/db/get-current-user-action"

export async function GET() {
  const currentUser = await getCurrentUserAction()
  if (!currentUser.isSuccess) {
    return new Response("Unauthorized", { status: 401 })
  }

  try {
    const conversations = await db
      .select()
      .from(conversationsTable)
      .where(eq(conversationsTable.userId, currentUser.data.user.id))
      .orderBy(desc(conversationsTable.createdAt))

    return new Response(JSON.stringify(conversations), {
      headers: { "Content-Type": "application/json" },
    })
  } catch (error) {
    console.error("Error fetching conversations:", error)
    return new Response("Internal Server Error", { status: 500 })
  }
}

export async function POST(req: Request) {
  const currentUser = await getCurrentUserAction()
  if (!currentUser.isSuccess) {
    return new Response("Unauthorized", { status: 401 })
  }

  const body = await req.json()
  const conversationData: InsertConversation = body

  try {
    const [conversation] = await db
      .insert(conversationsTable)
      .values({
        ...conversationData,
        userId: currentUser.data.user.id,
      })
      .returning()

    return new Response(JSON.stringify(conversation), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    })
  } catch (error) {
    console.error("Error creating conversation:", error)
    return new Response("Internal Server Error", { status: 500 })
  }
} 