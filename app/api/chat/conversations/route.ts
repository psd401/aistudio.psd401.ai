import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserAction } from "@/actions/db/get-current-user-action"
import { executeSQL } from "@/lib/db/data-api-adapter"

export async function GET() {
  const currentUser = await getCurrentUserAction()
  if (!currentUser.isSuccess) {
    return new Response("Unauthorized", { status: 401 })
  }

  try {
    const query = `
      SELECT id, user_id, title, created_at, updated_at,
             model_id, source, execution_id, context
      FROM conversations
      WHERE user_id = :userId
      ORDER BY created_at DESC
    `;
    const parameters = [
      { name: 'userId', value: { longValue: currentUser.data.user.id } }
    ];
    
    const conversations = await executeSQL(query, parameters);

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

  try {
    const insertQuery = `
      INSERT INTO conversations (title, user_id, model_id, source, execution_id, context)
      VALUES (:title, :userId, :modelId, :source, :executionId, :context)
      RETURNING id, user_id, title, created_at, updated_at, model_id, source, execution_id, context
    `;
    const insertParams = [
      { name: 'title', value: { stringValue: body.title || 'New Conversation' } },
      { name: 'userId', value: { longValue: currentUser.data.user.id } },
      { name: 'modelId', value: body.modelId ? { longValue: body.modelId } : { isNull: true } },
      { name: 'source', value: { stringValue: body.source || 'chat' } },
      { name: 'executionId', value: body.executionId ? { stringValue: body.executionId } : { isNull: true } },
      { name: 'context', value: body.context ? { stringValue: JSON.stringify(body.context) } : { isNull: true } }
    ];
    
    const result = await executeSQL(insertQuery, insertParams);
    const conversation = result[0];

    return new Response(JSON.stringify(conversation), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    })
  } catch (error) {
    console.error("Error creating conversation:", error)
    return new Response("Internal Server Error", { status: 500 })
  }
} 